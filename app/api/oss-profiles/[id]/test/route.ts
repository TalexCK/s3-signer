import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { mapProfile, query } from "@/lib/db";
import { testProfile } from "@/lib/s3";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const result = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND disabled_at IS NULL",
      [id]
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    await testProfile(mapProfile(result.rows[0]));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
