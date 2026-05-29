import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { mapProfile, query, withTransaction } from "@/lib/db";
import { publicProfile } from "@/lib/serializers";
import { createProfileSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await query(
      `SELECT * FROM oss_profiles
       WHERE owner_sub = $1 AND disabled_at IS NULL
       ORDER BY is_default DESC, created_at DESC`,
      [user.id]
    );

    return NextResponse.json({
      profiles: result.rows.map(mapProfile).map(publicProfile),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = createProfileSchema.parse(await request.json());

    const profile = await withTransaction(async (client) => {
      const count = await client.query(
        "SELECT count(*)::int AS count FROM oss_profiles WHERE owner_sub = $1 AND disabled_at IS NULL",
        [user.id]
      );
      const shouldDefault = payload.isDefault || count.rows[0]?.count === 0;

      if (shouldDefault) {
        await client.query(
          "UPDATE oss_profiles SET is_default = false WHERE owner_sub = $1",
          [user.id]
        );
      }

      const result = await client.query(
        `INSERT INTO oss_profiles (
          id, owner_sub, name, endpoint, region, bucket, access_key_id,
          encrypted_secret_access_key, encrypted_session_token,
          force_path_style, is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          randomUUID(),
          user.id,
          payload.name,
          payload.endpoint.replace(/\/$/, ""),
          payload.region,
          payload.bucket,
          payload.accessKeyId,
          encryptSecret(payload.secretAccessKey),
          encryptSecret(payload.sessionToken),
          payload.forcePathStyle,
          shouldDefault,
        ]
      );

      return mapProfile(result.rows[0]);
    });

    return NextResponse.json({ profile: publicProfile(profile) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}
