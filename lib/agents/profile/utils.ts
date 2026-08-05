export function stableId(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
export function cleanString(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function cleanStringList(value: unknown, limit = 40) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))].slice(0, limit);
}

export function cleanLineNumbers(value: unknown, lineCount: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((line): line is number => Number.isInteger(line) && line >= 1 && line <= lineCount))]
    .sort((left, right) => left - right);
}

export function safeHttpUrl(value: unknown) {
  const candidate = cleanString(value);
  if (!candidate) return undefined;
  try {
    const normalized = /^[a-z\d.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(candidate)
      ? `https://${candidate}`
      : candidate;
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function sourceLines(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}
