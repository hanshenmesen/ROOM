/**
 * SHA-256 hex digest of arbitrary text. Used to record "this call was fed
 * exactly this content" without storing the content itself (see
 * `AgentCallMeta.contentHash`): a trace or eval report can confirm two runs
 * saw byte-identical input, or diagnose a Prompt/Provider regression by
 * comparing hashes across a version bump, without ever persisting the
 * (potentially PII-bearing) prompt or source text.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
