import { describe, expect, it, vi } from "vitest";
import { publicLink, publicProfile } from "@/lib/serializers";
import type { DownloadLink, OssProfile } from "@/lib/types";

describe("serializers", () => {
  it("does not expose encrypted profile secrets", () => {
    const profile: OssProfile = {
      id: "profile-id",
      ownerSub: "user-a",
      name: "Aliyun",
      endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
      region: "oss-cn-hangzhou",
      bucket: "bucket",
      accessKeyId: "ak",
      encryptedSecretAccessKey: "encrypted-secret",
      encryptedSessionToken: "encrypted-token",
      forcePathStyle: false,
      isDefault: true,
      disabledAt: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    expect(publicProfile(profile)).not.toHaveProperty("encryptedSecretAccessKey");
    expect(publicProfile(profile)).not.toHaveProperty("encryptedSessionToken");
  });

  it("marks links expired by time or max downloads", () => {
    vi.stubEnv("PUBLIC_DOWNLOAD_BASE_URL", "https://api.example.test/download");
    const link: DownloadLink = {
      id: "00000000-0000-4000-8000-000000000000",
      ownerSub: "user-a",
      ossProfileId: "profile-id",
      profileSnapshot: {
        name: "Aliyun",
        endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
        region: "oss-cn-hangzhou",
        bucket: "bucket",
        forcePathStyle: false,
      },
      objectKey: "file.zip",
      validUntil: new Date(Date.now() + 60_000).toISOString(),
      maxDownloads: 2,
      downloadsServed: 2,
      downloadFilename: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      deletedAt: null,
    };

    expect(publicLink(link).isExpired).toBe(true);
    expect(publicLink({ ...link, downloadsServed: 0 }).downloadUrl).toBe(
      "https://api.example.test/download/00000000-0000-4000-8000-000000000000"
    );
  });

  it("keeps permanent links active until their download limit is reached", () => {
    const link: DownloadLink = {
      id: "00000000-0000-4000-8000-000000000000",
      ownerSub: "user-a",
      ossProfileId: "profile-id",
      profileSnapshot: {
        name: "Aliyun",
        endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
        region: "oss-cn-hangzhou",
        bucket: "bucket",
        forcePathStyle: false,
      },
      objectKey: "file.zip",
      validUntil: null,
      maxDownloads: 2,
      downloadsServed: 1,
      downloadFilename: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      deletedAt: null,
    };

    expect(publicLink(link).isExpired).toBe(false);
    expect(publicLink({ ...link, downloadsServed: 2 }).isExpired).toBe(true);
  });
});
