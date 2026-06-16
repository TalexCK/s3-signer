import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapLink, mapProfile, query, withTransaction } from "@/lib/db";
import { buildDownloadUrl } from "@/lib/env";
import { publicLink } from "@/lib/serializers";
import { createLinkSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await query(
      `SELECT l.*, p.disabled_at AS profile_disabled_at
       FROM download_links l
       JOIN oss_profiles p ON p.id = l.oss_profile_id
       WHERE l.owner_sub = $1 AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [user.id]
    );

    return NextResponse.json({
      links: result.rows.map((row) =>
        publicLink(mapLink(row), row.profile_disabled_at)
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = createLinkSchema.parse(await request.json());

    const link = await withTransaction(async (client) => {
      const profileResult = await client.query(
        "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
        [payload.profileId]
      );
      if (profileResult.rowCount === 0) {
        throw new HttpError(404, "OSS profile not found");
      }
      if (user.role !== "admin") {
        const ownedObject = await client.query(
          `SELECT 1 FROM object_uploads
           WHERE oss_profile_id = $1 AND object_key = $2 AND owner_sub = $3`,
          [payload.profileId, payload.objectKey, user.id]
        );
        if (ownedObject.rowCount === 0) {
          throw new HttpError(403, "Object is not owned by this user");
        }
      }

      const profile = mapProfile(profileResult.rows[0]);
      const validUntil =
        payload.validForSeconds === null
          ? null
          : new Date(Date.now() + payload.validForSeconds * 1000);
      const result = await client.query(
        `INSERT INTO download_links (
          id, owner_sub, oss_profile_id, profile_snapshot, object_key,
          valid_until, max_downloads, download_filename
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          randomUUID(),
          user.id,
          profile.id,
          {
            name: profile.name,
            endpoint: profile.endpoint,
            region: profile.region,
            bucket: profile.bucket,
            forcePathStyle: profile.forcePathStyle,
          },
          payload.objectKey,
          validUntil,
          payload.maxDownloads ?? null,
          payload.downloadFilename || null,
        ]
      );

      return mapLink(result.rows[0]);
    });

    return NextResponse.json(
      { link: publicLink(link), url: buildDownloadUrl(link.id) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}
