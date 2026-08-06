import { cleanString } from "./profile/utils.ts";

function bounded(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/**
 * Extracts a provider's error message from common response shapes:
 * `{ error: "..." }` (some gateways), `{ error: { message } }` (DeepSeek /
 * OpenAI style), and `{ detail: "..." }` (MAAS style). Bounded and
 * whitespace-normalized; safe to surface to users because providers return
 * request-validation messages, never credentials.
 */
export function providerErrorDetail(payload: unknown, maxLength = 220): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return bounded(cleanString(error), maxLength);
  if (error && typeof error === "object") {
    return bounded(cleanString((error as Record<string, unknown>).message), maxLength);
  }
  return bounded(cleanString(record.detail), maxLength);
}
