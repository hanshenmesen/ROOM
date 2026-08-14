/**
 * Process-local concurrency leases.
 *
 * Each lease carries an expiry timestamp as a leak safety net: if a worker
 * isolate dies (or a client disconnect skips the `finally` release) the
 * lease lapses on its own instead of permanently consuming the client's
 * slots. The TTL comfortably covers the slowest downstream call (provider
 * timeout) plus orchestration slack. Normal completions still release
 * immediately — the TTL only bounds failure modes.
 */

import { PROFILE_AGENT_LEASE_TTL_MS } from "./run-controls.ts";

const DEFAULT_LEASE_TTL_MS = PROFILE_AGENT_LEASE_TTL_MS;

type ConcurrencyLease = { id: string; expiresAt: number };

/** Per client key: individually releasable active leases. */
const activeRequests = new Map<string, ConcurrencyLease[]>();

let acquiredTotal = 0;
let rejectedTotal = 0;

export async function privacySafeRequestKey(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "anonymous";
  const userAgent = request.headers.get("user-agent") || "unknown-client";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${forwarded}\n${userAgent}`),
  );
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function liveLeases(key: string, now: number) {
  const alive = (activeRequests.get(key) || []).filter((lease) => lease.expiresAt > now);
  if (alive.length) activeRequests.set(key, alive);
  else activeRequests.delete(key);
  return alive;
}

export function tryAcquireConcurrencyLease(key: string, maximum: number, ttlMs = DEFAULT_LEASE_TTL_MS) {
  const now = Date.now();
  const alive = liveLeases(key, now);
  if (alive.length >= maximum) {
    rejectedTotal += 1;
    return undefined;
  }
  acquiredTotal += 1;
  const lease = { id: crypto.randomUUID(), expiresAt: now + ttlMs };
  alive.push(lease);
  activeRequests.set(key, alive);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const leases = activeRequests.get(key);
    if (!leases?.length) return;
    const remaining = leases.filter((activeLease) => activeLease.id !== lease.id);
    if (remaining.length) activeRequests.set(key, remaining);
    else activeRequests.delete(key);
  };
}

/**
 * Process-local lease counters for the metrics endpoint. Client keys are
 * never exposed: only aggregate counts, so the view stays free of
 * per-client identifiers.
 */
export function concurrencyLeaseMetrics() {
  const now = Date.now();
  let activeLeases = 0;
  for (const key of [...activeRequests.keys()]) {
    activeLeases += liveLeases(key, now).length;
  }
  return {
    activeLeases,
    distinctClients: activeRequests.size,
    acquiredTotal,
    rejectedTotal,
  };
}

export function clearConcurrencyLeasesForTests() {
  activeRequests.clear();
  acquiredTotal = 0;
  rejectedTotal = 0;
}
