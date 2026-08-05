const SENSITIVE_KEY = /(?:authorization|api[-_]?key|cookie|secret|password|credential|access[-_]?token|refresh[-_]?token)/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const INLINE_SECRET = /\b(authorization|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|cookie|secret|password|credential)\b(\s*[:=]\s*)([^\s,;&}]+)/gi;

function redactString(value: string) {
  return value
    .replace(BEARER_VALUE, "Bearer [REDACTED]")
    .replace(INLINE_SECRET, (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`)
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]");
}
export function redactTraceValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactTraceValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactTraceValue(entry),
  ]));
}
