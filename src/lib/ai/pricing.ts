/** USD per 1M tokens. Gemini 3.8 Flash introductory pricing (through 31 Dec 2026). */
export const PRICING: Record<string, { input: number; output: number; label: string }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75, label: "Gemini 3.8 Flash" },
  "gemini-3.5-flash-lite": { input: 0.75, output: 3.75, label: "Gemini 3.5 Flash-Lite (cost shown at Flash rates)" },
};

export const MODELS = Object.entries(PRICING).map(([id, p]) => ({ id, label: p.label }));

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["gemini-3.8-flash"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
