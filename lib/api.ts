import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { message: "Invalid request", issues: error.issues },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ message: "Internal server error" }, { status: 500 });
}
