import { NextResponse } from "next/server";
import { HttpError, jsonError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapProfile, query } from "@/lib/db";
import { listObjects } from "@/lib/s3";
import { listObjectsSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const params = listObjectsSchema.parse({
      profileId: url.searchParams.get("profileId"),
      query: url.searchParams.get("query") ?? "",
      continuationToken: url.searchParams.get("continuationToken") ?? undefined,
    });

    const profileResult = await query(
      "SELECT * FROM oss_profiles WHERE id = $1 AND owner_sub = $2 AND disabled_at IS NULL",
      [params.profileId, user.id]
    );
    if (profileResult.rowCount === 0) {
      throw new HttpError(404, "OSS profile not found");
    }

    const result = await listObjects(mapProfile(profileResult.rows[0]), params);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
