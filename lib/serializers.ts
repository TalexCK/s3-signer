import { buildDownloadUrl } from "@/lib/env";
import type {
  DownloadLink,
  LinkResponse,
  OssProfile,
  PublicOssProfile,
} from "@/lib/types";

export function publicProfile(profile: OssProfile): PublicOssProfile {
  return {
    id: profile.id,
    name: profile.name,
    endpoint: profile.endpoint,
    region: profile.region,
    bucket: profile.bucket,
    accessKeyId: profile.accessKeyId,
    forcePathStyle: profile.forcePathStyle,
    isDefault: profile.isDefault,
    disabledAt: profile.disabledAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function publicLink(
  link: DownloadLink,
  profileDisabledAt?: string | null
): LinkResponse {
  const validUntil = new Date(link.validUntil);
  const isExpired =
    validUntil.getTime() <= Date.now() ||
    (!!link.maxDownloads && link.downloadsServed >= link.maxDownloads);

  return {
    id: link.id,
    profileId: link.ossProfileId,
    profileName: link.profileSnapshot.name,
    bucket: link.profileSnapshot.bucket,
    objectKey: link.objectKey,
    validUntil: link.validUntil,
    maxDownloads: link.maxDownloads,
    downloadsServed: link.downloadsServed,
    downloadFilename: link.downloadFilename,
    createdAt: link.createdAt,
    deletedAt: link.deletedAt,
    isExpired,
    isDisabled: !!profileDisabledAt,
    downloadUrl: buildDownloadUrl(link.id),
  };
}
