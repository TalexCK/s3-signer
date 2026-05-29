import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapLink, query } from "@/lib/db";
import { publicLink } from "@/lib/serializers";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const result = await query(
      `SELECT l.*, p.disabled_at AS profile_disabled_at
       FROM download_links l
       JOIN oss_profiles p ON p.id = l.oss_profile_id
       WHERE l.id = $1 AND l.owner_sub = $2 AND l.deleted_at IS NULL`,
      [id, user.id]
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "Download link not found");
    }

    return NextResponse.json({
      link: publicLink(mapLink(result.rows[0]), result.rows[0].profile_disabled_at),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    const result = await query(
      `UPDATE download_links
       SET deleted_at = COALESCE(deleted_at, now())
       WHERE id = $1 AND owner_sub = $2
       RETURNING id`,
      [id, user.id]
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "Download link not found");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
