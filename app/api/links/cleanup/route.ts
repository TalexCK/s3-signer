import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const result = await query(
      `UPDATE download_links
       SET deleted_at = COALESCE(deleted_at, now())
       WHERE owner_sub = $1
         AND deleted_at IS NULL
         AND (
           valid_until <= now()
           OR (max_downloads IS NOT NULL AND downloads_served >= max_downloads)
         )`,
      [user.id]
    );

    return NextResponse.json({ deletedCount: result.rowCount ?? 0 });
  } catch (error) {
    return jsonError(error);
  }
}
