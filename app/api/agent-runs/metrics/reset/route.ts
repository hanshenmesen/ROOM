import { NextResponse } from "next/server";
import { inMemoryTraceStore } from "@/lib/agent-runtime/in-memory-trace-store";

export const runtime = "edge";

/**
 * Clears the bounded in-memory Trace window so the metrics panel starts
 * from a clean slate (e.g. before a demo). Active concurrency leases are
 * deliberately left untouched: they describe live state, not history.
 */
export async function POST() {
  inMemoryTraceStore.clear();
  return NextResponse.json({ ok: true, windowRuns: 0 }, {
    headers: { "cache-control": "no-store" },
  });
}
