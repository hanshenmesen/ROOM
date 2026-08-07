/**
 * Deployment-specific provider identifiers.
 *
 * The tracked codebase deliberately contains NO internal hostnames, gateway
 * app ids, or internal model names -- those are injected via environment
 * variables at local/deploy time (see .env.example). When an env is unset,
 * the corresponding provider route simply does not exist for the process,
 * which is exactly what a fresh clone from git should see.
 */

/** Hostname of the internal OpenAI-compatible MAAS gateway, e.g. "maas.internal.example". */
export function internalMaasHost() {
  return (process.env.INTERNAL_MAAS_HOST || "").trim().toLowerCase();
}

/** Value for the gateway's x-maas-app-id header. */
export function internalMaasAppId() {
  return (process.env.INTERNAL_MAAS_APP_ID || "").trim();
}

/** Models offered on the internal gateway, comma-separated. */
export function internalMaasModels() {
  return (process.env.INTERNAL_MAAS_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

/** Full base URL of the external Anthropic-compatible MAAS gateway. */
export function externalMaasBaseUrl() {
  return (process.env.EXTERNAL_MAAS_BASE_URL || "").trim().replace(/\/+$/, "");
}

export function externalMaasModel() {
  return (process.env.EXTERNAL_MAAS_MODEL || "").trim();
}

/** Optional second Claude route on the external gateway used as a fallback model. */
export function externalMaasFallbackModel() {
  return (process.env.EXTERNAL_MAAS_FALLBACK_MODEL || "").trim();
}

export function externalMaasHostname() {
  try {
    return new URL(externalMaasBaseUrl()).hostname.toLowerCase();
  } catch {
    return "";
  }
}
