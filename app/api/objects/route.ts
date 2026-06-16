import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapProfile, query, withTransaction } from "@/lib/db";
import { deleteObject, listObjects, signUploadUrl } from "@/lib/s3";
import {
  deleteObjectSchema,
  listObjectsSchema,
  uploadObjectsSchema,
} from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const params = listObjectsSchema.parse({
      profileId: url.searchParams.get("profileId"),
      query: url.searchParams.get("query") ?? "",
      prefix: url.searchParams.get("prefix") ?? "",
      continuationToken: url.searchParams.get("continuationToken") ?? undefined,
    });

    const profileResult = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
      [params.profileId]
    );
    if (profileResult.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    const result = await listObjects(mapProfile(profileResult.rows[0]), params);
    if (user.role === "user") {
      result.objects = await filterUserObjects(
        params.profileId,
        user.id,
        params.prefix,
        result.objects
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const params = uploadObjectsSchema.parse(await request.json());

    const profileResult = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
      [params.profileId]
    );
    if (profileResult.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    const profile = mapProfile(profileResult.rows[0]);
    const prefix = normalizeUploadPrefix(params.prefix);
    const uploads = await Promise.all(
      params.files.map(async (file) => {
        const objectKey = `${prefix}${normalizeFileName(file.name)}`;
        if (!objectKey || objectKey.endsWith("/")) {
          throw new HttpError(400, "Invalid file name");
        }

        return {
          objectKey,
          url: await signUploadUrl(profile, objectKey, file.contentType),
          contentType: file.contentType || null,
        };
      })
    );
    if (uploads.length) {
      await query(
        `INSERT INTO object_uploads (oss_profile_id, object_key, owner_sub)
         SELECT $1, item.object_key, $2
         FROM jsonb_to_recordset($3::jsonb) AS item(object_key text)
         ON CONFLICT (oss_profile_id, object_key) DO UPDATE
         SET owner_sub = EXCLUDED.owner_sub, created_at = now()`,
        [
          params.profileId,
          user.id,
          JSON.stringify(uploads.map((upload) => ({ object_key: upload.objectKey }))),
        ]
      );
    }

    return NextResponse.json({ uploads });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const payload = deleteObjectSchema.parse(await request.json());

    const deletedLinks = await withTransaction(async (client) => {
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

      await deleteObject(mapProfile(profileResult.rows[0]), payload.objectKey);

      const result =
        user.role === "admin"
          ? await client.query(
              `UPDATE download_links
               SET deleted_at = now()
               WHERE oss_profile_id = $1
                 AND object_key = $2
                 AND deleted_at IS NULL
               RETURNING id`,
              [payload.profileId, payload.objectKey]
            )
          : await client.query(
              `UPDATE download_links
               SET deleted_at = now()
               WHERE owner_sub = $1
                 AND oss_profile_id = $2
                 AND object_key = $3
                 AND deleted_at IS NULL
               RETURNING id`,
              [user.id, payload.profileId, payload.objectKey]
            );
      await client.query(
        "DELETE FROM object_uploads WHERE oss_profile_id = $1 AND object_key = $2",
        [payload.profileId, payload.objectKey]
      );

      return result.rowCount ?? 0;
    });

    return NextResponse.json({ deletedLinks });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}

function normalizeUploadPrefix(prefix: string) {
  const cleaned = prefix.trim().replace(/^\/+/, "");
  if (!cleaned) {
    return "";
  }

  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

function normalizeFileName(name: string) {
  return name.replace(/^\/+/, "").replaceAll("\\", "/");
}

async function filterUserObjects(
  profileId: string,
  userId: string,
  prefix: string,
  objects: Awaited<ReturnType<typeof listObjects>>["objects"]
) {
  const objectKeys = objects
    .filter((object) => object.kind !== "folder")
    .map((object) => object.key);
  const folderPrefixes = objects
    .filter((object) => object.kind === "folder")
    .map((object) => object.key);

  const ownedFiles = objectKeys.length
    ? await query<{ object_key: string }>(
        `SELECT object_key FROM object_uploads
         WHERE oss_profile_id = $1 AND owner_sub = $2 AND object_key = ANY($3)`,
        [profileId, userId, objectKeys]
      )
    : { rows: [] };
  const ownedFileSet = new Set(ownedFiles.rows.map((row) => row.object_key));

  const ownedFolders = folderPrefixes.length
    ? await query<{ object_key: string }>(
        `SELECT object_key FROM object_uploads
         WHERE oss_profile_id = $1
           AND owner_sub = $2
           AND (${folderPrefixes.map((_, index) => `object_key LIKE $${index + 3}`).join(" OR ")})
         LIMIT 100`,
        [profileId, userId, ...folderPrefixes.map((folder) => `${folder}%`)]
      )
    : { rows: [] };
  const ownedFolderSet = new Set(
    folderPrefixes.filter((folder) =>
      ownedFolders.rows.some((row) => row.object_key.startsWith(folder))
    )
  );

  return objects.filter((object) => {
    if (object.kind === "folder") {
      return ownedFolderSet.has(object.key);
    }

    return (
      object.key.startsWith(prefix) &&
      ownedFileSet.has(object.key)
    );
  });
}
