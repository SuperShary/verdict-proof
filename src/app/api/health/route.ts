import { NextResponse } from "next/server";
import { dailyCap } from "@/lib/ai/capLimit";

/** Lets the UI show whether the server-side AI key is configured, without revealing it. */
export async function GET() {
  return NextResponse.json({ ai: Boolean(process.env.GEMINI_API_KEY), cap: dailyCap() });
}
