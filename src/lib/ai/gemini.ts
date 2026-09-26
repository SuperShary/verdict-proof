import "server-only";
import { GoogleGenAI } from "@google/genai";
import { costUsd } from "./pricing";

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("The server has no Gemini API key configured (GEMINI_API_KEY).", 503);
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export interface JsonCallResult {
  json: unknown;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ms: number;
}

/** One structured-output call through the Interactions API. Nothing is stored server-side. */
export async function callJson(opts: {
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
  pdfBase64?: string;
  thinking?: "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<JsonCallResult> {
  const t0 = Date.now();
  const input = [
    { type: "text" as const, text: opts.prompt },
    ...(opts.pdfBase64 ? [{ type: "document" as const, data: opts.pdfBase64, mime_type: "application/pdf" as const }] : []),
  ];

  const call = ai().interactions.create({
    model: opts.model,
    input,
    store: false,
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
    generation_config: { thinking_level: opts.thinking ?? "low" },
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new AiError("Gemini did not answer in time.", 504)), opts.timeoutMs ?? 60_000),
  );

  let res: Awaited<typeof call>;
  try {
    res = await Promise.race([call, timeout]);
  } catch (e) {
    if (e instanceof AiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new AiError(`Gemini request failed: ${msg.slice(0, 300)}`);
  }

  const text = res.output_text ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("Gemini returned output that is not valid JSON.");
  }
  const inputTokens = res.usage?.total_input_tokens ?? 0;
  const outputTokens = (res.usage?.total_output_tokens ?? 0) + (res.usage?.total_thought_tokens ?? 0);
  return { json, inputTokens, outputTokens, costUsd: costUsd(opts.model, inputTokens, outputTokens), ms: Date.now() - t0 };
}
