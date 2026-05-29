import "server-only";

import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { decryptSecret } from "@/lib/crypto";
import { getAppConfig } from "@/lib/env";
import type { ObjectInfo, OssProfile, ProfileSnapshot } from "@/lib/types";

interface SigningProfile {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  encryptedSecretAccessKey: string;
  encryptedSessionToken: string | null;
}

function createClient(profile: SigningProfile) {
  const secretAccessKey = decryptSecret(profile.encryptedSecretAccessKey);
  if (!secretAccessKey) {
    throw new Error("OSS profile secret is unavailable");
  }

  const sessionToken = decryptSecret(profile.encryptedSessionToken);

  return new S3Client({
    region: profile.region,
    endpoint: profile.endpoint,
    forcePathStyle: profile.forcePathStyle,
    credentials: {
      accessKeyId: profile.accessKeyId,
      secretAccessKey,
      sessionToken,
    },
  });
}

export async function testProfile(profile: OssProfile) {
  const client = createClient(profile);
  await client.send(new HeadBucketCommand({ Bucket: profile.bucket }));
}

export async function listObjects(
  profile: OssProfile,
  options: { prefix?: string; continuationToken?: string }
) {
  const client = createClient(profile);
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: profile.bucket,
      Prefix: options.prefix || undefined,
      ContinuationToken: options.continuationToken,
      MaxKeys: 100,
    })
  );

  return {
    objects:
      result.Contents?.map<ObjectInfo>((object) => ({
        key: object.Key ?? "",
        lastModified: object.LastModified?.toISOString() ?? null,
        size: object.Size ?? 0,
        storageClass: object.StorageClass ?? null,
      })).filter((object) => object.key.length > 0) ?? [],
    isTruncated: result.IsTruncated ?? false,
    nextContinuationToken: result.NextContinuationToken,
  };
}

export async function signDownloadUrl(
  profile: Pick<
    OssProfile,
    "accessKeyId" | "encryptedSecretAccessKey" | "encryptedSessionToken"
  >,
  snapshot: ProfileSnapshot,
  objectKey: string,
  downloadFilename?: string | null
) {
  const client = createClient({
    ...snapshot,
    accessKeyId: profile.accessKeyId,
    encryptedSecretAccessKey: profile.encryptedSecretAccessKey,
    encryptedSessionToken: profile.encryptedSessionToken,
  });

  const command = new GetObjectCommand({
    Bucket: snapshot.bucket,
    Key: objectKey,
    ResponseContentDisposition: buildDisposition(downloadFilename),
  });

  return getSignedUrl(client, command, {
    expiresIn: getAppConfig().signedUrlTtlSeconds,
  });
}

function buildDisposition(filename?: string | null) {
  const cleaned = filename?.replace(/["\r\n]/g, "").trim();
  if (!cleaned) {
    return undefined;
  }

  return `attachment; filename="${cleaned}"`;
}
