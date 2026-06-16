"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  CopyIcon,
  FileIcon,
  FolderPlusIcon,
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
  UploadIcon,
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
    role: "admin" | "user";
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

interface SettingsFormState {
  adminGroups: string;
  userGroups: string;
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
  const [activeTab, setActiveTab] = useState("browse");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [generatingObjectKey, setGeneratingObjectKey] = useState("");
  const [validForSeconds, setValidForSeconds] = useState("86400");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>({
    adminGroups: "",
    userGroups: "",
  });
  const [editingProfile, setEditingProfile] = useState<PublicOssProfile | null>(
    null,
  );
  const [profileForm, setProfileForm] =
    useState<ProfileFormState>(defaultProfileForm);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [objectSearch, setObjectSearch] = useState("");
  const [browsePrefix, setBrowsePrefix] = useState("");
  const [continuationToken, setContinuationToken] = useState<string | null>(
    null,
  );
  const [nextContinuationToken, setNextContinuationToken] = useState<
    string | undefined
  >();
  const [busyActions, setBusyActions] = useState<Set<string>>(() => new Set());
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const isAdmin = user.role === "admin";

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

  const refreshSettings = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    const data = await api<{
      settings: { adminGroups: string[]; userGroups: string[] };
    }>("/api/settings");
    setSettingsForm({
      adminGroups: data.settings.adminGroups.join(", "),
      userGroups: data.settings.userGroups.join(", "),
    });
  }, [isAdmin]);

  const refreshAll = useCallback(async () => {
    await runBusy("refresh", async () => {
      await Promise.all([
        refreshProfiles(),
        refreshLinks(),
        isAdmin ? refreshSettings() : Promise.resolve(),
      ]);
    });
  }, [isAdmin, refreshLinks, refreshProfiles, refreshSettings, runBusy]);

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
    if (!generatingObjectKey) {
      toast.error("Select an object first.");
      return;
    }

    await runBusy("create-link", async () => {
      const payload = {
        profileId: selectedProfileId,
        objectKey: generatingObjectKey,
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
      setGenerateDialogOpen(false);
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

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) {
      toast.error("Admin group required.");
      return;
    }

    await runBusy("save-settings", async () => {
      const data = await api<{
        settings: { adminGroups: string[]; userGroups: string[] };
      }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          adminGroups: parseGroupInput(settingsForm.adminGroups),
          userGroups: parseGroupInput(settingsForm.userGroups),
        }),
      });
      setSettingsForm({
        adminGroups: data.settings.adminGroups.join(", "),
        userGroups: data.settings.userGroups.join(", "),
      });
      toast.success("Settings saved.");
    });
  }

  async function loadObjects(
    next = false,
    queryOverride?: string,
    continuationOverride?: string | null,
    prefixOverride?: string,
    profileIdOverride?: string,
  ) {
    const requestProfileId = profileIdOverride ?? selectedProfileId;
    if (!requestProfileId) {
      return;
    }

    await runBusy(next ? "objects-next" : "objects-search", async () => {
      const requestQuery = queryOverride ?? objectSearch;
      const params = new URLSearchParams({
        profileId: requestProfileId,
        query: requestQuery,
      });
      const requestPrefix = prefixOverride ?? browsePrefix;
      if (requestPrefix) {
        params.set("prefix", requestPrefix);
      }
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

  async function uploadSelectedFiles(files: FileList | null) {
    if (!selectedProfileId) {
      toast.error("Select an OSS profile first.");
      return;
    }
    if (!files?.length) {
      return;
    }

    await runBusy("objects-upload", async () => {
      const selectedFiles = Array.from(files).map((file) => {
        const relativePath =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;
        return { file, relativePath };
      });
      const hasFolderPaths = selectedFiles.some(({ relativePath }) =>
        relativePath.includes("/"),
      );

      const data = await api<{
        uploads: Array<{
          objectKey: string;
          url: string;
          contentType: string | null;
        }>;
      }>("/api/objects", {
        method: "POST",
        body: JSON.stringify({
          profileId: selectedProfileId,
          prefix: browsePrefix,
          files: selectedFiles.map(({ file, relativePath }) => ({
            name: relativePath,
            contentType: file.type || null,
          })),
        }),
      });

      await Promise.all(
        data.uploads.map(async (upload, index) => {
          const file = selectedFiles[index]?.file;
          if (!file) {
            throw new Error("Upload file list changed unexpectedly");
          }

          const response = await fetch(upload.url, {
            method: "PUT",
            headers: upload.contentType
              ? { "content-type": upload.contentType }
              : undefined,
            body: file,
          });
          if (!response.ok) {
            throw new Error(`Failed to upload ${upload.objectKey}`);
          }
        }),
      );

      const uploadKind = hasFolderPaths
        ? "Folder"
        : data.uploads.length === 1
          ? "File"
          : "Files";
      toast.success(`${uploadKind} uploaded. ${data.uploads.length} object(s) saved.`);
      await loadObjects(false, objectSearch, null, browsePrefix);
    });
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfileId) {
      toast.error("Select an OSS profile first.");
      return;
    }

    await runBusy("create-folder", async () => {
      const data = await api<{ objectKey: string }>("/api/objects", {
        method: "PUT",
        body: JSON.stringify({
          profileId: selectedProfileId,
          prefix: browsePrefix,
          name: newFolderName,
        }),
      });
      setCreateFolderDialogOpen(false);
      setNewFolderName("");
      toast.success(`Folder created: ${data.objectKey}`);
      await loadObjects(false, objectSearch, null, browsePrefix);
    });
  }

  async function deleteObjectFromBrowse(key: string) {
    if (!selectedProfileId) {
      toast.error("Select an OSS profile first.");
      return;
    }
    if (!window.confirm(`Delete ${key} from OSS and archive its history?`)) {
      return;
    }

    await runBusy(`delete-object:${key}`, async () => {
      const data = await api<{ deletedLinks: number }>("/api/objects", {
        method: "DELETE",
        body: JSON.stringify({
          profileId: selectedProfileId,
          objectKey: key,
        }),
      });
      setObjects((current) => current.filter((object) => object.key !== key));
      setLinks((current) =>
        current.filter(
          (link) => link.profileId !== selectedProfileId || link.objectKey !== key,
        ),
      );
      toast.success(
        `Object deleted. ${data.deletedLinks} history item(s) archived.`,
      );
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

  function selectTab(value: string) {
    setActiveTab(value);
    if (value === "browse" && selectedProfileId) {
      void loadObjects(false, objectSearch, null, browsePrefix);
    }
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
        <Tabs value={activeTab} onValueChange={selectTab}>
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            {isAdmin && <TabsTrigger value="profiles">OSS Profiles</TabsTrigger>}
            <TabsTrigger value="history">History</TabsTrigger>
            {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="browse">
            <Card>
              <CardHeader>
                <CardTitle>Browse Objects</CardTitle>
                <CardDescription>
                  {selectedProfile
                    ? `${selectedProfile.bucket} · ${currentBrowsePrefix(browsePrefix)}`
                    : "Select an OSS profile to browse objects"}
                </CardDescription>
                <CardAction>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedProfileId || isBusy("objects-upload")}
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      <BusyIcon
                        busy={isBusy("objects-upload")}
                        idle={<UploadIcon data-icon="inline-start" />}
                      />
                      Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedProfileId || isBusy("create-folder")}
                      onClick={() => setCreateFolderDialogOpen(true)}
                    >
                      <BusyIcon
                        busy={isBusy("create-folder")}
                        idle={<FolderPlusIcon data-icon="inline-start" />}
                      />
                      New folder
                    </Button>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    void uploadSelectedFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1fr_auto]">
                    <Field>
                      <FieldLabel>OSS profile</FieldLabel>
                      <Select
                        value={selectedProfileId}
                        onValueChange={(value) => {
                          const nextProfileId = value ?? "";
                          setSelectedProfileId(nextProfileId);
                          setObjects([]);
                          setContinuationToken(null);
                          setNextContinuationToken(undefined);
                          void loadObjects(
                            false,
                            objectSearch,
                            null,
                            browsePrefix,
                            nextProfileId,
                          );
                        }}
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
                      <FieldLabel>Directory</FieldLabel>
                      <Input
                        value={browsePrefix}
                        onChange={(event) => setBrowsePrefix(event.target.value)}
                        placeholder="archives/"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Search</FieldLabel>
                      <Input
                        value={objectSearch}
                        onChange={(event) => setObjectSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void loadObjects(false, objectSearch, null, browsePrefix);
                          }
                        }}
                        placeholder="Filter current directory"
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full md:w-auto"
                        onClick={() =>
                          loadObjects(false, objectSearch, null, browsePrefix)
                        }
                        disabled={!selectedProfileId || isBusy("objects-search")}
                      >
                        <BusyIcon
                          busy={isBusy("objects-search")}
                          idle={<SearchIcon data-icon="inline-start" />}
                        />
                        Browse
                      </Button>
                    </div>
                  </div>

                  <ObjectTable
                    objects={objects}
                    prefix={browsePrefix}
                    onOpenFolder={(prefix) => {
                      setBrowsePrefix(prefix);
                      setObjectSearch("");
                      setContinuationToken(null);
                      setNextContinuationToken(undefined);
                      void loadObjects(false, "", null, prefix);
                    }}
                    onGenerate={(key) => {
                      setGeneratingObjectKey(key);
                      setGenerateDialogOpen(true);
                    }}
                    onDelete={deleteObjectFromBrowse}
                    canDelete
                    isBusy={isBusy}
                  />
                  <div className="flex justify-end">
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
                  </div>
                </div>
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

          {isAdmin && (
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Settings</CardTitle>
                  <CardDescription>
                    Configure which OIDC groups map to admin and user access.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={saveSettings}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Admin Group</FieldLabel>
                        <Input
                          value={settingsForm.adminGroups}
                          onChange={(event) =>
                            setSettingsForm((current) => ({
                              ...current,
                              adminGroups: event.target.value,
                            }))
                          }
                          placeholder="admin"
                        />
                        <FieldDescription>
                          Members can manage settings, OSS profiles, all files, and history.
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel>User Group</FieldLabel>
                        <Input
                          value={settingsForm.userGroups}
                          onChange={(event) =>
                            setSettingsForm((current) => ({
                              ...current,
                              userGroups: event.target.value,
                            }))
                          }
                          placeholder="users"
                        />
                        <FieldDescription>
                          Members can browse and share only files they uploaded.
                        </FieldDescription>
                      </Field>
                      <div className="flex justify-end">
                        <Button type="submit" disabled={isBusy("save-settings")}>
                          <BusyIcon
                            busy={isBusy("save-settings")}
                            idle={<CheckCircleIcon data-icon="inline-start" />}
                          />
                          Save settings
                        </Button>
                      </div>
                    </FieldGroup>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          )}
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

      <Dialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
      >
        <DialogContent>
          <form onSubmit={createFolder}>
            <DialogHeader>
              <DialogTitle>New Folder</DialogTitle>
              <DialogDescription>
                Create a folder under {currentBrowsePrefix(browsePrefix)}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Field>
                <FieldLabel>Folder name</FieldLabel>
                <Input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="documents"
                  autoFocus
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateFolderDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isBusy("create-folder") || !newFolderName.trim()}
              >
                <BusyIcon
                  busy={isBusy("create-folder")}
                  idle={<FolderPlusIcon data-icon="inline-start" />}
                />
                Create folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={createLink}>
            <DialogHeader>
              <DialogTitle>Generate Link</DialogTitle>
              <DialogDescription className="truncate">
                {generatingObjectKey || "Select an object from Browse"}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <FieldGroup>
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
                          <SelectItem value="Permanent">Permanent</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Max downloads</FieldLabel>
                    <Input
                      value={maxDownloads}
                      onChange={(event) => setMaxDownloads(event.target.value)}
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
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGenerateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isBusy("create-link") || !generatingObjectKey}
              >
                <BusyIcon
                  busy={isBusy("create-link")}
                  idle={<CopyIcon data-icon="inline-start" />}
                />
                Generate and copy
              </Button>
            </DialogFooter>
          </form>
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

function ObjectTable({
  objects,
  prefix,
  onOpenFolder,
  onGenerate,
  onDelete,
  canDelete,
  isBusy,
}: {
  objects: ObjectInfo[];
  prefix: string;
  onOpenFolder: (prefix: string) => void;
  onGenerate: (key: string) => void;
  onDelete: (key: string) => void;
  canDelete: boolean;
  isBusy: (key: string) => boolean;
}) {
  if (!objects.length) {
    return (
      <div className="rounded-lg border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No objects</EmptyTitle>
            <EmptyDescription>Matching objects will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <Table>
        <TableBody>
          {objects.map((object) => {
            const isFolder = object.kind === "folder";
            return (
              <TableRow key={object.key}>
                <TableCell className="max-w-lg truncate font-medium">
                  <div className="flex min-w-0 items-center gap-2">
                    {isFolder ? (
                      <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">
                      {relativeObjectName(object.key, prefix)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{isFolder ? "" : formatBytes(object.size)}</TableCell>
                <TableCell>{isFolder ? "Folder" : (object.storageClass ?? "")}</TableCell>
                <TableCell className="text-right">
                  {isFolder ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenFolder(object.key)}
                    >
                      Open
                    </Button>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onGenerate(object.key)}
                      >
                        <CopyIcon data-icon="inline-start" />
                        Generate
                      </Button>
                      {canDelete && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isBusy(`delete-object:${object.key}`)}
                          onClick={() => onDelete(object.key)}
                        >
                          <BusyIcon
                            busy={isBusy(`delete-object:${object.key}`)}
                            idle={<Trash2Icon data-icon="inline-start" />}
                          />
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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

function currentBrowsePrefix(prefix: string) {
  const cleaned = prefix.trim();
  if (!cleaned) {
    return "/";
  }

  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

function relativeObjectName(key: string, prefix: string) {
  const normalizedPrefix = currentBrowsePrefix(prefix);
  if (normalizedPrefix === "/") {
    return key;
  }

  return key.startsWith(normalizedPrefix)
    ? key.slice(normalizedPrefix.length)
    : key;
}

function parseGroupInput(value: string) {
  return value
    .split(/[,\s]+/)
    .map((group) => group.trim())
    .filter(Boolean);
}
