const activeRequests = new Map<string, number>();

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

export function tryAcquireConcurrencyLease(key: string, maximum: number) {
  const active = activeRequests.get(key) || 0;
  if (active >= maximum) {
    rejectedTotal += 1;
    return undefined;
  }
  acquiredTotal += 1;
  activeRequests.set(key, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeRequests.get(key) || 1) - 1;
    if (remaining > 0) activeRequests.set(key, remaining);
    else activeRequests.delete(key);
  };
}

/**
 * Process-local lease counters for the metrics endpoint. Client keys are
 * never exposed: only aggregate counts, so the view stays free of
 * per-client identifiers.
 */
export function concurrencyLeaseMetrics() {
  return {
    activeLeases: [...activeRequests.values()].reduce((total, count) => total + count, 0),
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
