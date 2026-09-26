"use client";
import { create } from "zustand";
import type { Run, StageEvent, StageId } from "@/lib/types";
import { STAGES } from "@/lib/pipeline/stages";

/** The run currently executing (or last finished) in the workspace. */
interface LiveState {
  status: "idle" | "running" | "done";
  fileUrl: string | null;
  fileName: string | null;
  stages: StageEvent[];
  run: Run | null;
  start: (fileName: string, fileUrl: string) => void;
  update: (e: StageEvent) => void;
  finish: (run: Run) => void;
  clear: () => void;
}

const fresh = (): StageEvent[] => STAGES.map((s) => ({ stage: s.id, status: "pending", startedAt: null, durationMs: null, summary: "" }));

export const useLive = create<LiveState>((set) => ({
  status: "idle",
  fileUrl: null,
  fileName: null,
  stages: fresh(),
  run: null,
  start: (fileName, fileUrl) => set({ status: "running", fileName, fileUrl, stages: fresh(), run: null }),
  update: (e) => set((s) => ({ stages: s.stages.map((x) => (x.stage === e.stage ? e : x)) })),
  finish: (run) => set({ status: "done", run, stages: run.stages }),
  clear: () => set({ status: "idle", fileUrl: null, fileName: null, stages: fresh(), run: null }),
}));

export const stageOf = (stages: StageEvent[], id: StageId) => stages.find((s) => s.stage === id)!;
