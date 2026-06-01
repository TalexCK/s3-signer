"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  CopyIcon,
  FileIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogOutIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LinkResponse, ObjectInfo, PublicOssProfile } from "@/lib/types";

interface DashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string | null;
  };
}

interface ProfileFormState {
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  forcePathStyle: boolean;
  isDefault: boolean;
}

const defaultProfileForm: ProfileFormState = {
  name: "",
  endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
  region: "oss-cn-hangzhou",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  forcePathStyle: false,
  isDefault: false,
};

export function DashboardClient({ user }: DashboardClientProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [profiles, setProfiles] = useState<PublicOssProfile[]>([]);
  const [links, setLinks] = useState<LinkResponse[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [objectKey, setObjectKey] = useState("");
  const [validForSeconds, setValidForSeconds] = useState("86400");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [objectDialogOpen, setObjectDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PublicOssProfile | null>(
    null,
  );
  const [profileForm, setProfileForm] =
    useState<ProfileFormState>(defaultProfileForm);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [objectSearch, setObjectSearch] = useState("");
  const [continuationToken, setContinuationToken] = useState<string | null>(
    null,
  );
  const [nextContinuationToken, setNextContinuationToken] = useState<
    string | undefined
  >();
  const [busyActions, setBusyActions] = useState<Set<string>>(() => new Set());

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const isBusy = useCallback(
    (key: string) => busyActions.has(key),
    [busyActions],
  );

  const runBusy = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyActions((current) => new Set(current).add(key));
      try {
        await action();
      } catch (error) {
        toast.error(messageOf(error));
      } finally {
        setBusyActions((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  const refreshProfiles = useCallback(async () => {
    const data = await api<{ profiles: PublicOssProfile[] }>(
      "/api/oss-profiles",
    );
    setProfiles(data.profiles);
    setSelectedProfileId((current) => {
      if (current && data.profiles.some((profile) => profile.id === current)) {
        return current;
      }
      return (
        data.profiles.find((profile) => profile.isDefault)?.id ??
        data.profiles[0]?.id ??
        ""
      );
    });
  }, []);

  const refreshLinks = useCallback(async () => {
    const data = await api<{ links: LinkResponse[] }>("/api/links");
    setLinks(data.links);
  }, []);

  const refreshAll = useCallback(async () => {
    await runBusy("refresh", async () => {
      await Promise.all([refreshProfiles(), refreshLinks()]);
    });
  }, [refreshLinks, refreshProfiles, runBusy]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAll]);

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfileId) {
      toast.error("Create an OSS profile first.");
      return;
    }

    await runBusy("create-link", async () => {
      const payload = {
        profileId: selectedProfileId,
        objectKey,
        validForSeconds:
          validForSeconds === "Permanent" ? null : Number(validForSeconds),
        maxDownloads: maxDownloads ? Number(maxDownloads) : null,
        downloadFilename: downloadFilename || null,
      };
      const data = await api<{ link: LinkResponse; url: string }>(
        "/api/links",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setLinks((current) => [data.link, ...current]);
      await copyText(data.url);
      toast.success("Download link copied.");
      setObjectKey("");
      setDownloadFilename("");
    });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBusy("save-profile", async () => {
      const payload = {
        ...profileForm,
        sessionToken: profileForm.sessionToken || null,
      };
      const path = editingProfile
        ? `/api/oss-profiles/${editingProfile.id}`
        : "/api/oss-profiles";
      const method = editingProfile ? "PATCH" : "POST";
      const data = await api<{ profile: PublicOssProfile }>(path, {
        method,
        body: JSON.stringify(payload),
      });

      await refreshProfiles();
      setSelectedProfileId(data.profile.id);
      setProfileDialogOpen(false);
      toast.success(
        editingProfile ? "OSS profile updated." : "OSS profile saved.",
      );
    });
  }

  async function loadObjects(
    next = false,
    queryOverride?: string,
    continuationOverride?: string | null,
  ) {
    if (!selectedProfileId) {
      return;
    }

    await runBusy(next ? "objects-next" : "objects-search", async () => {
      const requestQuery = queryOverride ?? objectSearch;
      const params = new URLSearchParams({
        profileId: selectedProfileId,
        query: requestQuery,
      });
      if (next && nextContinuationToken) {
        params.set("continuationToken", nextContinuationToken);
      } else {
        const token = continuationOverride ?? continuationToken;
        if (token) {
          params.set("continuationToken", token);
        }
      }

      const data = await api<{
        objects: ObjectInfo[];
        isTruncated: boolean;
        nextContinuationToken?: string;
      }>(`/api/objects?${params.toString()}`);
      setObjects(data.objects);
      setContinuationToken(next ? (nextContinuationToken ?? null) : null);
      setNextContinuationToken(data.nextContinuationToken);
    });
  }

  async function deleteLink(link: LinkResponse) {
    if (!window.confirm(`Delete link for ${link.objectKey}?`)) {
      return;
    }
    await runBusy(`delete-link:${link.id}`, async () => {
      await api(`/api/links/${link.id}`, { method: "DELETE" });
      setLinks((current) => current.filter((item) => item.id !== link.id));
      toast.success("Download link deleted.");
    });
  }

  async function deleteProfile(profile: PublicOssProfile) {
    if (!window.confirm(`Disable profile ${profile.name}?`)) {
      return;
    }
    await runBusy(`delete-profile:${profile.id}`, async () => {
      await api(`/api/oss-profiles/${profile.id}`, { method: "DELETE" });
      await refreshProfiles();
      toast.success("OSS profile disabled.");
    });
  }

  async function setDefaultProfile(profile: PublicOssProfile) {
    await runBusy(`default-profile:${profile.id}`, async () => {
      await api(`/api/oss-profiles/${profile.id}/default`, { method: "POST" });
      await refreshProfiles();
      toast.success("Default profile updated.");
    });
  }

  async function testProfile(profile: PublicOssProfile) {
    await runBusy(`test-profile:${profile.id}`, async () => {
      await api(`/api/oss-profiles/${profile.id}/test`, { method: "POST" });
      toast.success("Bucket access verified.");
    });
  }

  async function copyLink(url: string, id: string) {
    await runBusy(`copy-link:${id}`, async () => {
      await copyText(url);
      toast.success("Download link copied.");
    });
  }

  async function cleanupLinks() {
    await runBusy("cleanup-links", async () => {
      const data = await api<{ deletedCount: number }>("/api/links/cleanup", {
        method: "POST",
      });
      await refreshLinks();
      toast.success(`${data.deletedCount} inactive links archived.`);
    });
  }

  function openNewProfile() {
    setEditingProfile(null);
    setProfileForm(defaultProfileForm);
    setProfileDialogOpen(true);
  }

  function openEditProfile(profile: PublicOssProfile) {
    setEditingProfile(profile);
    setProfileForm({
      name: profile.name,
      endpoint: profile.endpoint,
      region: profile.region,
      bucket: profile.bucket,
      accessKeyId: profile.accessKeyId,
      secretAccessKey: "",
      sessionToken: "",
      forcePathStyle: profile.forcePathStyle,
      isDefault: profile.isDefault,
    });
    setProfileDialogOpen(true);
  }

  function openObjectBrowser() {
    const initialQuery = objectKey;
    setObjects([]);
    setObjectSearch(initialQuery);
    setContinuationToken(null);
    setNextContinuationToken(undefined);
    setObjectDialogOpen(true);
    void loadObjects(false, initialQuery, null);
  }

  const isDark = resolvedTheme === "dark";

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">S3 Signer</h1>
            <p className="truncate text-sm text-muted-foreground">
              {user.name}
              {user.email ? ` · ${user.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => refreshAll()}
                    disabled={isBusy("refresh")}
                  />
                }
              >
                <BusyIcon busy={isBusy("refresh")} idle={<RefreshCwIcon />} />
                <span className="sr-only">Refresh</span>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                  />
                }
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                <span className="sr-only">Toggle theme</span>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() =>
                      runBusy("sign-out", async () => {
                        await signOut();
                      })
                    }
                    disabled={isBusy("sign-out")}
                  />
                }
              >
                <BusyIcon busy={isBusy("sign-out")} idle={<LogOutIcon />} />
                <span className="sr-only">Sign out</span>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Tabs defaultValue="create">
          <TabsList>
            <TabsTrigger value="create">Generate</TabsTrigger>
            <TabsTrigger value="profiles">OSS Profiles</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Generate Link</CardTitle>
                <CardDescription>
                  {selectedProfile
                    ? `${selectedProfile.bucket} · ${selectedProfile.endpoint}`
                    : "No OSS profile selected"}
                </CardDescription>
                <CardAction>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openNewProfile}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Profile
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <form onSubmit={createLink}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>OSS profile</FieldLabel>
                      <Select
                        value={selectedProfileId}
                        onValueChange={(value) =>
                          setSelectedProfileId(value ?? "")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select profile" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {profiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.name} · {profile.bucket}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Object key</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          value={objectKey}
                          onChange={(event) => setObjectKey(event.target.value)}
                          placeholder="archives/report.zip"
                          required
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            onClick={openObjectBrowser}
                            disabled={
                              !selectedProfileId || isBusy("objects-search")
                            }
                          >
                            <BusyIcon
                              busy={isBusy("objects-search")}
                              idle={<FolderOpenIcon data-icon="inline-start" />}
                            />
                            Browse
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field>
                        <FieldLabel>Valid for</FieldLabel>
                        <Select
                          value={validForSeconds}
                          onValueChange={(value) =>
                            setValidForSeconds(value ?? "86400")
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="3600">1 hour</SelectItem>
                              <SelectItem value="86400">1 day</SelectItem>
                              <SelectItem value="604800">7 days</SelectItem>
                              <SelectItem value="2592000">30 days</SelectItem>
                              <SelectItem value="Permanent">
                                Permanent
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>Max downloads</FieldLabel>
                        <Input
                          value={maxDownloads}
                          onChange={(event) =>
                            setMaxDownloads(event.target.value)
                          }
                          inputMode="numeric"
                          placeholder="Unlimited"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Filename</FieldLabel>
                        <Input
                          value={downloadFilename}
                          onChange={(event) =>
                            setDownloadFilename(event.target.value)
                          }
                          placeholder="Optional"
                        />
                      </Field>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={isBusy("create-link") || !profiles.length}
                      >
                        <BusyIcon
                          busy={isBusy("create-link")}
                          idle={<CopyIcon data-icon="inline-start" />}
                        />
                        Generate and copy
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profiles">
            <Card>
              <CardHeader>
                <CardTitle>OSS Profiles</CardTitle>
                <CardDescription>
                  {profiles.length} active profiles
                </CardDescription>
                <CardAction>
                  <Button type="button" onClick={openNewProfile}>
                    <PlusIcon data-icon="inline-start" />
                    Add profile
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {profiles.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Bucket</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles.map((profile) => (
                        <TableRow key={profile.id}>
                          <TableCell className="font-medium">
                            {profile.name}
                          </TableCell>
                          <TableCell>{profile.bucket}</TableCell>
                          <TableCell className="max-w-80 truncate">
                            {profile.endpoint}
                          </TableCell>
                          <TableCell>
                            {profile.isDefault ? (
                              <Badge>Default</Badge>
                            ) : (
                              <Badge variant="secondary">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <ProfileActions
                              profile={profile}
                              onEdit={openEditProfile}
                              onTest={testProfile}
                              onDefault={setDefaultProfile}
                              onDelete={deleteProfile}
                              isBusy={isBusy}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <KeyRoundIcon />
                      </EmptyMedia>
                      <EmptyTitle>No OSS profiles</EmptyTitle>
                      <EmptyDescription>
                        Add a profile to sign download URLs.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button type="button" onClick={openNewProfile}>
                        <PlusIcon data-icon="inline-start" />
                        Add profile
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
                <CardDescription>{links.length} recent links</CardDescription>
                <CardAction>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cleanupLinks}
                    disabled={isBusy("cleanup-links")}
                  >
                    <BusyIcon
                      busy={isBusy("cleanup-links")}
                      idle={<Trash2Icon data-icon="inline-start" />}
                    />
                    Cleanup
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {links.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Object</TableHead>
                        <TableHead>Profile</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Downloads</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.map((link) => (
                        <TableRow key={link.id}>
                          <TableCell className="max-w-80 truncate font-medium">
                            {link.objectKey}
                          </TableCell>
                          <TableCell>{link.profileName}</TableCell>
                          <TableCell>{formatDate(link.validUntil)}</TableCell>
                          <TableCell>
                            {link.downloadsServed}
                            {link.maxDownloads ? ` / ${link.maxDownloads}` : ""}
                          </TableCell>
                          <TableCell>
                            <LinkStatus link={link} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="outline"
                                      size="icon-xs"
                                      onClick={() =>
                                        copyLink(link.downloadUrl, link.id)
                                      }
                                      disabled={isBusy(`copy-link:${link.id}`)}
                                    />
                                  }
                                >
                                  <BusyIcon
                                    busy={isBusy(`copy-link:${link.id}`)}
                                    idle={<CopyIcon />}
                                  />
                                  <span className="sr-only">Copy</span>
                                </TooltipTrigger>
                                <TooltipContent>Copy</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="destructive"
                                      size="icon-xs"
                                      onClick={() => deleteLink(link)}
                                      disabled={isBusy(
                                        `delete-link:${link.id}`,
                                      )}
                                    />
                                  }
                                >
                                  <BusyIcon
                                    busy={isBusy(`delete-link:${link.id}`)}
                                    idle={<Trash2Icon />}
                                  />
                                  <span className="sr-only">Delete</span>
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileIcon />
                      </EmptyMedia>
                      <EmptyTitle>No links yet</EmptyTitle>
                      <EmptyDescription>
                        Generated links will appear here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={saveProfile}>
            <DialogHeader>
              <DialogTitle>
                {editingProfile ? "Edit OSS Profile" : "Add OSS Profile"}
              </DialogTitle>
              <DialogDescription>
                S3-compatible credentials are encrypted before storage.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={profileForm.name}
                      onChange={(event) =>
                        setProfileFormField("name", event.target.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Bucket</FieldLabel>
                    <Input
                      value={profileForm.bucket}
                      onChange={(event) =>
                        setProfileFormField("bucket", event.target.value)
                      }
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Endpoint</FieldLabel>
                  <Input
                    value={profileForm.endpoint}
                    onChange={(event) =>
                      setProfileFormField("endpoint", event.target.value)
                    }
                    required
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>Region</FieldLabel>
                    <Input
                      value={profileForm.region}
                      onChange={(event) =>
                        setProfileFormField("region", event.target.value)
                      }
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Access key ID</FieldLabel>
                    <Input
                      value={profileForm.accessKeyId}
                      onChange={(event) =>
                        setProfileFormField("accessKeyId", event.target.value)
                      }
                      required
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Secret access key</FieldLabel>
                  <Input
                    value={profileForm.secretAccessKey}
                    onChange={(event) =>
                      setProfileFormField("secretAccessKey", event.target.value)
                    }
                    type="password"
                    required={!editingProfile}
                    placeholder={editingProfile ? "Unchanged" : undefined}
                  />
                </Field>
                <Field>
                  <FieldLabel>Session token</FieldLabel>
                  <Input
                    value={profileForm.sessionToken}
                    onChange={(event) =>
                      setProfileFormField("sessionToken", event.target.value)
                    }
                    type="password"
                    placeholder="Optional"
                  />
                </Field>
                <FieldSet>
                  <Field orientation="horizontal">
                    <Switch
                      checked={profileForm.forcePathStyle}
                      onCheckedChange={(checked) =>
                        setProfileFormField("forcePathStyle", checked)
                      }
                    />
                    <FieldContent>
                      <FieldTitle>Force path style</FieldTitle>
                      <FieldDescription>
                        Use only when your S3-compatible endpoint requires it.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                  {!editingProfile && (
                    <Field orientation="horizontal">
                      <Switch
                        checked={profileForm.isDefault}
                        onCheckedChange={(checked) =>
                          setProfileFormField("isDefault", checked)
                        }
                      />
                      <FieldContent>
                        <FieldTitle>Default profile</FieldTitle>
                        <FieldDescription>
                          New links start with this profile selected.
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </FieldSet>
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProfileDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy("save-profile")}>
                <BusyIcon
                  busy={isBusy("save-profile")}
                  idle={<CheckCircleIcon data-icon="inline-start" />}
                />
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={objectDialogOpen} onOpenChange={setObjectDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Object Browser</DialogTitle>
            <DialogDescription>
              {selectedProfile
                ? `${selectedProfile.name} · ${selectedProfile.bucket}`
                : "Select an OSS profile"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={objectSearch}
                onChange={(event) => setObjectSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadObjects(false, objectSearch, null);
                  }
                }}
                placeholder="Search by object key"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => loadObjects(false, objectSearch, null)}
                  disabled={isBusy("objects-search")}
                >
                  <BusyIcon
                    busy={isBusy("objects-search")}
                    idle={<SearchIcon data-icon="inline-start" />}
                  />
                  Search
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <div className="max-h-96 overflow-auto rounded-lg border">
              {objects.length ? (
                <Table>
                  <TableBody>
                    {objects.map((object) => (
                      <TableRow key={object.key}>
                        <TableCell className="max-w-lg truncate font-medium">
                          {object.key}
                        </TableCell>
                        <TableCell>{formatBytes(object.size)}</TableCell>
                        <TableCell>{object.storageClass ?? ""}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setObjectKey(object.key);
                              setObjectDialogOpen(false);
                            }}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchIcon />
                    </EmptyMedia>
                    <EmptyTitle>No objects</EmptyTitle>
                    <EmptyDescription>
                      Matching objects will appear here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!nextContinuationToken || isBusy("objects-next")}
              onClick={() => loadObjects(true)}
            >
              {isBusy("objects-next") && (
                <Loader2Icon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              )}
              Next page
            </Button>
            <Button type="button" onClick={() => setObjectDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );

  function setProfileFormField<T extends keyof ProfileFormState>(
    key: T,
    value: ProfileFormState[T],
  ) {
    setProfileForm((current) => ({ ...current, [key]: value }));
  }
}

function ProfileActions({
  profile,
  onEdit,
  onTest,
  onDefault,
  onDelete,
  isBusy,
}: {
  profile: PublicOssProfile;
  onEdit: (profile: PublicOssProfile) => void;
  onTest: (profile: PublicOssProfile) => void;
  onDefault: (profile: PublicOssProfile) => void;
  onDelete: (profile: PublicOssProfile) => void;
  isBusy: (key: string) => boolean;
}) {
  const testing = isBusy(`test-profile:${profile.id}`);
  const settingDefault = isBusy(`default-profile:${profile.id}`);
  const deleting = isBusy(`delete-profile:${profile.id}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={testing || settingDefault || deleting}
          >
            <BusyIcon
              busy={testing || settingDefault || deleting}
              idle={<MoreHorizontalIcon />}
            />
            <span className="sr-only">Open actions</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onEdit(profile)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={testing} onClick={() => onTest(profile)}>
            {testing && <Loader2Icon className="animate-spin" />}
            Test
          </DropdownMenuItem>
          {!profile.isDefault && (
            <DropdownMenuItem
              disabled={settingDefault}
              onClick={() => onDefault(profile)}
            >
              {settingDefault && <Loader2Icon className="animate-spin" />}
              Set default
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            disabled={deleting}
            onClick={() => onDelete(profile)}
          >
            {deleting && <Loader2Icon className="animate-spin" />}
            Disable
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BusyIcon({ busy, idle }: { busy: boolean; idle: ReactNode }) {
  if (busy) {
    return <Loader2Icon data-icon="inline-start" className="animate-spin" />;
  }

  return idle;
}

function LinkStatus({ link }: { link: LinkResponse }) {
  if (link.isDisabled) {
    return <Badge variant="destructive">Profile disabled</Badge>;
  }
  if (link.isExpired) {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  return <Badge>Active</Badge>;
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      // Keep the HTTP status text.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatDate(value: string | null) {
  if (value === null) {
    return "Permanent";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}
