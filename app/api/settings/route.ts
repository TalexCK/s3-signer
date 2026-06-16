import { NextResponse } from "next/server";
import { getAccessSettings, saveAccessSettings } from "@/lib/access";
import { HttpError, jsonError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { accessSettingsSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ settings: await getAccessSettings() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const settings = accessSettingsSchema.parse(await request.json());
    await saveAccessSettings(settings);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonError(new HttpError(400, "Invalid JSON"));
    }
    return jsonError(error);
  }
}
