import { requireUser } from "@/lib/auth";
import { HttpError, jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireUser();
    throw new HttpError(403, "Link cleanup is disabled");
  } catch (error) {
    return jsonError(error);
  }
}
