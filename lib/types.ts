export interface OssProfile {
  id: string;
  ownerSub: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  encryptedSecretAccessKey: string;
  encryptedSessionToken: string | null;
  forcePathStyle: boolean;
  isDefault: boolean;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicOssProfile {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  forcePathStyle: boolean;
  isDefault: boolean;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSnapshot {
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
}

export interface DownloadLink {
  id: string;
  ownerSub: string;
  ossProfileId: string;
  profileSnapshot: ProfileSnapshot;
  objectKey: string;
  validUntil: string | null;
  maxDownloads: number | null;
  downloadsServed: number;
  downloadFilename: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface LinkResponse {
  id: string;
  profileId: string;
  profileName: string;
  bucket: string;
  objectKey: string;
  validUntil: string | null;
  maxDownloads: number | null;
  downloadsServed: number;
  downloadFilename: string | null;
  createdAt: string;
  deletedAt: string | null;
  isExpired: boolean;
  isDisabled: boolean;
  downloadUrl: string;
}

export interface ObjectInfo {
  key: string;
  lastModified: string | null;
  size: number;
  storageClass: string | null;
  kind?: "file" | "folder";
}
