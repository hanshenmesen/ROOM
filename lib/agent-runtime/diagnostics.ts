/**
 * Diagnostic payload dumps for agent failures.
 *
 * Production traces stay redacted by design, which is correct for privacy
 * but made real-world debugging depend on ad-hoc `console.error` calls that
 * dumped raw model output -- including user PII (names, employers, contact
 * details) -- into server logs. This module replaces those dumps with a
 * structural summary by default: key paths, value types, array lengths, and
 * string lengths are enough to diagnose shape mismatches (missing keys,
 * out-of-range line numbers, empty arrays) without exposing any content.
 *
 * Numbers and booleans are passed through verbatim: line numbers, token
 * counts, and status codes carry no PII and are exactly what shape
 * diagnosis needs. Strings are the PII vector, so they are only described
 * by length.
 *
 * Set AGENT_DIAGNOSTIC_PAYLOADS=1 in local development to dump truncated
 * raw values instead. Never enable it on a deployed environment.
 */

const MAX_DEPTH = 5;
const MAX_SAMPLE_ITEMS = 3;
const MAX_KEYS = 30;
const MAX_OUTPUT_CHARS = 2_000;

export function diagnosticPayloadsEnabled() {
  return process.env.AGENT_DIAGNOSTIC_PAYLOADS === "1";
}

export function summarizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return { type: "string", chars: value.length };
  if (value === undefined) return { type: "undefined" };
  if (depth >= MAX_DEPTH) return { type: Array.isArray(value) ? "array" : typeof value, truncated: true };
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, MAX_SAMPLE_ITEMS).map((item) => summarizeDiagnosticValue(item, depth + 1)),
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sample: Record<string, unknown> = {};
    for (const [key, entry] of entries.slice(0, MAX_KEYS)) {
      sample[key] = summarizeDiagnosticValue(entry, depth + 1);
    }
    return { type: "object", keyCount: entries.length, sample };
  }
  return { type: typeof value };
}

/**
 * Logs a diagnostic payload. Known-safe context (error codes, provider and
 * model names, structural validation messages) belongs in `label`, which is
 * always logged verbatim; `value` is the untrusted model/provider payload
 * and is summarized unless payload dumping is explicitly enabled.
 */
export function diagnosticDump(label: string, value: unknown) {
  const rendered = diagnosticPayloadsEnabled()
    ? JSON.stringify(value)
    : JSON.stringify(summarizeDiagnosticValue(value));
  console.error(label, (rendered || String(rendered)).slice(0, MAX_OUTPUT_CHARS));
}
