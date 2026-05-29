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
  options: { query?: string; continuationToken?: string }
) {
  const client = createClient(profile);
  const query = options.query?.trim().toLowerCase() ?? "";
  const maxMatches = 100;
  const maxPages = query ? 20 : 1;
  let continuationToken = options.continuationToken;
  const objects: ObjectInfo[] = [];
  let isTruncated = false;
  let nextContinuationToken: string | undefined;

  for (let page = 0; page < maxPages && objects.length < maxMatches; page += 1) {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: profile.bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 100,
      })
    );

    const pageObjects =
      result.Contents?.map<ObjectInfo>((object) => ({
        key: object.Key ?? "",
        lastModified: object.LastModified?.toISOString() ?? null,
        size: object.Size ?? 0,
        storageClass: object.StorageClass ?? null,
      })).filter(
        (object) =>
          object.key.length > 0 && (!query || object.key.toLowerCase().includes(query))
      ) ?? [];

    objects.push(...pageObjects.slice(0, maxMatches - objects.length));
    isTruncated = result.IsTruncated ?? false;
    nextContinuationToken = result.NextContinuationToken;

    if (!isTruncated) {
      break;
    }

    continuationToken = nextContinuationToken;
  }

  return {
    objects,
    isTruncated,
    nextContinuationToken,
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
