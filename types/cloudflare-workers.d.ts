/**
 * Minimal ambient declaration for the `cloudflare:workers` module.
 *
 * The full `@cloudflare/workers-types` package is intentionally not a
 * dependency: ROOM only reads bindings from `env`, and binding values are
 * narrowed structurally at the usage site (see `lib/workflow/resolve-store.ts`
 * and `db/index.ts`).
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
