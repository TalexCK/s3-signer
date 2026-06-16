import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { mapProfile, query, withTransaction } from "@/lib/db";
import { publicProfile } from "@/lib/serializers";
import { updateProfileSchema } from "@/lib/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const payload = updateProfileSchema.parse(await request.json());

    const existing = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
      [id]
    );
    if (existing.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    const current = mapProfile(existing.rows[0]);
    const result = await query(
      `UPDATE oss_profiles SET
        name = $2,
        endpoint = $3,
        region = $4,
        bucket = $5,
        access_key_id = $6,
        encrypted_secret_access_key = $7,
        encrypted_session_token = $8,
        force_path_style = $9,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        payload.name ?? current.name,
        payload.endpoint?.replace(/\/$/, "") ?? current.endpoint,
        payload.region ?? current.region,
        payload.bucket ?? current.bucket,
        payload.accessKeyId ?? current.accessKeyId,
        payload.secretAccessKey
          ? encryptSecret(payload.secretAccessKey)
          : current.encryptedSecretAccessKey,
        payload.sessionToken !== undefined
          ? encryptSecret(payload.sessionToken)
          : current.encryptedSessionToken,
        payload.forcePathStyle ?? current.forcePathStyle,
      ]
    );

    return NextResponse.json({ profile: publicProfile(mapProfile(result.rows[0])) });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    const profile = await withTransaction(async (client) => {
      const existing = await client.query(
        "SELECT is_default FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL FOR UPDATE",
        [id]
      );
      if (existing.rowCount === 0) {
        throw new HttpError(404, "OSS profile not found");
      }

      const wasDefault = !!existing.rows[0].is_default;
      await client.query(
        `UPDATE oss_profiles
         SET disabled_at = COALESCE(disabled_at, now()), is_default = false, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      if (!wasDefault) {
        return null;
      }

      const nextDefault = await client.query(
        `UPDATE oss_profiles
         SET is_default = true, updated_at = now()
         WHERE id = (
           SELECT id FROM oss_profiles
           WHERE disabled_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
         )
         RETURNING *`,
      );

      return nextDefault.rowCount ? mapProfile(nextDefault.rows[0]) : null;
    });

    return NextResponse.json({
      ok: true,
      defaultProfile: profile ? publicProfile(profile) : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
