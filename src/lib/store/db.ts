import Dexie, { type Table } from "dexie";
import type { Run } from "@/lib/types";
import type { BatchScore } from "@/lib/batch/run";

export interface BatchRecord {
  id: string;
  createdAt: number;
  seed: number;
  score: BatchScore;
}

/** Everything the app remembers lives here, in the browser. No server database. */
class ProofDB extends Dexie {
  runs!: Table<Run, string>;
  files!: Table<{ id: string; blob: Blob }, string>;
  batches!: Table<BatchRecord, string>;
  constructor() {
    super("verdict-proof");
    this.version(1).stores({ runs: "id, createdAt", files: "id", batches: "id, createdAt" });
  }
}

export const db = new ProofDB();

export async function saveRun(run: Run, blob: Blob) {
  await db.transaction("rw", db.runs, db.files, async () => {
    await db.runs.put(run);
    await db.files.put({ id: run.id, blob });
  });
}

export async function saveBatch(rec: BatchRecord) {
  await db.batches.put(rec);
}

export async function clearHistory() {
  await db.transaction("rw", db.runs, db.files, db.batches, async () => {
    await db.runs.clear();
    await db.files.clear();
    await db.batches.clear();
  });
}
