import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function createLocalBindingConfig(env: Record<string, string | undefined>) {
  return {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
  vars: {
    ...(env.WEBSITE_AGENT_API_KEY ? { WEBSITE_AGENT_API_KEY: env.WEBSITE_AGENT_API_KEY } : {}),
    ...(env.WEBSITE_AGENT_BASE_URL ? { WEBSITE_AGENT_BASE_URL: env.WEBSITE_AGENT_BASE_URL } : {}),
    ...(env.WEBSITE_AGENT_MODEL ? { WEBSITE_AGENT_MODEL: env.WEBSITE_AGENT_MODEL } : {}),
    ...(env.MAAS_API_KEY ? { MAAS_API_KEY: env.MAAS_API_KEY } : {}),
    ...(env.MAAS_API_KEY_FALLBACK ? { MAAS_API_KEY_FALLBACK: env.MAAS_API_KEY_FALLBACK } : {}),
    ...(env.MAAS_BASE_URL ? { MAAS_BASE_URL: env.MAAS_BASE_URL } : {}),
    ...(env.MAAS_MODEL ? { MAAS_MODEL: env.MAAS_MODEL } : {}),
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
  };
}

export default defineConfig(async ({ command, mode }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const localEnvironment = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const runtimeEnvironment = command === "serve" ? localEnvironment : {};

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: createLocalBindingConfig(runtimeEnvironment),
      }),
    ],
  };
});
