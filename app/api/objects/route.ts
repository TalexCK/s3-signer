import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapProfile, query } from "@/lib/db";
import {
  createFolderObject,
  listObjects,
  signUploadUrl,
} from "@/lib/s3";
import {
  createFolderSchema,
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

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const payload = createFolderSchema.parse(await request.json());

    const profileResult = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
      [payload.profileId]
    );
    if (profileResult.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    const prefix = normalizeUploadPrefix(payload.prefix);
    const folderName = normalizeFolderName(payload.name);
    const objectKey = `${prefix}${folderName}/`;
    if (!folderName || objectKey === "/") {
      throw new HttpError(400, "Invalid folder name");
    }

    await createFolderObject(mapProfile(profileResult.rows[0]), objectKey);
    await query(
      `INSERT INTO object_uploads (oss_profile_id, object_key, owner_sub)
       VALUES ($1, $2, $3)
       ON CONFLICT (oss_profile_id, object_key) DO UPDATE
       SET owner_sub = EXCLUDED.owner_sub, created_at = now()`,
      [payload.profileId, objectKey, user.id]
    );

    return NextResponse.json({ objectKey }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    await requireUser();
    throw new HttpError(403, "Object deletion is disabled");
  } catch (error) {
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

function normalizeFolderName(name: string) {
  return name.replace(/^\/+/, "").replace(/\/+$/, "").replaceAll("\\", "/");
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
