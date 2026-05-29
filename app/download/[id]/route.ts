import { NextResponse } from "next/server";
import { HttpError } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { signDownloadUrl } from "@/lib/s3";
import type { ProfileSnapshot } from "@/lib/types";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const signedUrl = await withTransaction(async (client) => {
      const result = await client.query(
        `SELECT
          l.id,
          l.object_key,
          l.valid_until,
          l.max_downloads,
          l.downloads_served,
          l.download_filename,
          l.profile_snapshot,
          p.access_key_id,
          p.encrypted_secret_access_key,
          p.encrypted_session_token,
          p.disabled_at
         FROM download_links l
         JOIN oss_profiles p ON p.id = l.oss_profile_id
         WHERE l.id = $1 AND l.deleted_at IS NULL
         FOR UPDATE OF l`,
        [id]
      );

      if (result.rowCount === 0) {
        throw new HttpError(404, "Download link not found");
      }

      const row = result.rows[0];
      if (row.disabled_at) {
        throw new HttpError(410, "OSS profile is disabled");
      }

      if (new Date(row.valid_until).getTime() <= Date.now()) {
        throw new HttpError(410, "Download link has expired");
      }

      if (
        row.max_downloads !== null &&
        row.downloads_served >= row.max_downloads
      ) {
        throw new HttpError(429, "Download limit exceeded");
      }

      const url = await signDownloadUrl(
        {
          accessKeyId: row.access_key_id,
          encryptedSecretAccessKey: row.encrypted_secret_access_key,
          encryptedSessionToken: row.encrypted_session_token,
        },
        row.profile_snapshot as ProfileSnapshot,
        row.object_key,
        row.download_filename
      );

      await client.query(
        "UPDATE download_links SET downloads_served = downloads_served + 1 WHERE id = $1",
        [id]
      );

      return url;
    });

    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    if (error instanceof HttpError) {
      return new NextResponse(error.message, { status: error.status });
    }

    console.error(error);
    return new NextResponse("Failed to generate download URL", { status: 500 });
  }
}
