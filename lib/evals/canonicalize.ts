import type { ExpectedText } from "./types.ts";

export function canonicalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.protocol.toLocaleLowerCase()}//${url.host.toLocaleLowerCase()}${path}${url.search}`;
  } catch {
    return canonicalizeText(value);
  }
}

export function expectedValues(value: ExpectedText) {
  return typeof value === "string" ? [value] : [value.value, ...(value.aliases || [])];
}

export function textMatchesExpected(actual: string | undefined, expected: ExpectedText, url = false) {
  if (!actual) return false;
  const normalize = url ? canonicalizeUrl : canonicalizeText;
  const normalizedActual = normalize(actual);
  return expectedValues(expected).some((value) => normalize(value) === normalizedActual);
}

function grams(value: string) {
  const compact = canonicalizeText(value).replace(/\s/g, "");
  if (compact.length < 2) return compact ? [compact] : [];
  return Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2));
}

export function titleSimilarity(left: string, right: string) {
  const a = canonicalizeText(left);
  const b = canonicalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.55 ? 0.92 : 0.7;
  }
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  const remaining = [...rightGrams];
  let overlap = 0;
  for (const gram of leftGrams) {
    const index = remaining.indexOf(gram);
    if (index < 0) continue;
    overlap += 1;
    remaining.splice(index, 1);
  }
  return leftGrams.length + rightGrams.length
    ? (2 * overlap) / (leftGrams.length + rightGrams.length)
    : 0;
}
