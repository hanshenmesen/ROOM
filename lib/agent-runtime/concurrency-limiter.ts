const activeRequests = new Map<string, number>();

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
  if (active >= maximum) return undefined;
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

export function clearConcurrencyLeasesForTests() {
  activeRequests.clear();
}
