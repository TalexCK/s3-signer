import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapProfile, withTransaction } from "@/lib/db";
import { publicProfile } from "@/lib/serializers";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const profile = await withTransaction(async (client) => {
      const existing = await client.query(
        "SELECT id FROM oss_profiles WHERE id = $1 AND owner_sub = $2 AND disabled_at IS NULL",
        [id, user.id]
      );
      if (existing.rowCount === 0) {
        throw new HttpError(404, "OSS profile not found");
      }

      await client.query(
        "UPDATE oss_profiles SET is_default = false WHERE owner_sub = $1",
        [user.id]
      );
      const result = await client.query(
        "UPDATE oss_profiles SET is_default = true, updated_at = now() WHERE id = $1 RETURNING *",
        [id]
      );
      return mapProfile(result.rows[0]);
    });

    return NextResponse.json({ profile: publicProfile(profile) });
  } catch (error) {
    return jsonError(error);
  }
}
