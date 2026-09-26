import { NextResponse } from "next/server";
import { AiError, callJson } from "@/lib/ai/gemini";
import { EXPLAIN_JSON_SCHEMA, ExplainZ } from "@/lib/ai/schema";
import { explainPrompt } from "@/lib/ai/prompts";
import { PRICING } from "@/lib/ai/pricing";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (Parameters<typeof explainPrompt>[0] & { model?: string }) | null;
  if (!body?.outcome) return NextResponse.json({ error: "Missing decision." }, { status: 400 });
  const m = body.model && PRICING[body.model] ? body.model : "gemini-3.8-flash";
  try {
    const r = await callJson({ model: m, prompt: explainPrompt(body), schema: EXPLAIN_JSON_SCHEMA, thinking: "low", timeoutMs: 25_000 });
    const out = ExplainZ.parse(r.json);
    return NextResponse.json({ ...out, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, ms: r.ms });
  } catch (e) {
    const status = e instanceof AiError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status });
  }
}
