import { NextResponse } from "next/server";
import { AiError, callJson } from "@/lib/ai/gemini";
import { takeFromCap } from "@/lib/ai/cap";
import { EXTRACTION_JSON_SCHEMA, parseExtraction } from "@/lib/ai/schema";
import { EXTRACTION_PROMPT } from "@/lib/ai/prompts";
import { PRICING } from "@/lib/ai/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const { pdfBase64, model } = (await req.json().catch(() => ({}))) as { pdfBase64?: string; model?: string };
  if (!pdfBase64) return NextResponse.json({ error: "No PDF provided." }, { status: 400 });
  if ((pdfBase64.length * 3) / 4 > MAX_BYTES) return NextResponse.json({ error: "PDF is larger than 8 MB." }, { status: 413 });
  const m = model && PRICING[model] ? model : "gemini-3.8-flash";

  const cap = takeFromCap();
  if (!cap.ok) return NextResponse.json({ error: `Daily demo limit of ${cap.cap} runs reached. Try again tomorrow.` }, { status: 429 });

  try {
    const r = await callJson({ model: m, prompt: EXTRACTION_PROMPT, schema: EXTRACTION_JSON_SCHEMA, pdfBase64, thinking: "low" });
    let extraction;
    try {
      extraction = parseExtraction(r.json);
    } catch {
      return NextResponse.json({ error: "Gemini's answer did not match the extraction schema." }, { status: 502 });
    }
    return NextResponse.json({ extraction, model: m, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, ms: r.ms });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status });
  }
}
