import { NextResponse } from "next/server";
import { ensureDatabase } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  await ensureDatabase();
  return NextResponse.json({ ok: true });
}
