/** Cloudflare Worker entry point for the vinext-starter template. */
import type { AnyD1Database } from "drizzle-orm/d1";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { DurableWorkflowStore } from "../lib/workflow/durable-workflow-store.ts";
import { createD1WorkflowMetadataStore } from "../lib/workflow/d1-metadata-store.ts";
import { R2ObjectStore, type R2BucketLike } from "../lib/workflow/object-store.ts";
import { enforceWorkflowRetention } from "../lib/workflow/retention.ts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  // Private object store for Workflow Run state/input/events. Bound only
  // when `.openai/hosting.json`'s `r2` field is set; anonymous local Run
  // recovery (checkpoints surviving a process restart) requires both this
  // and `DB` to be present -- see lib/workflow/resolve-store.ts.
  WORKFLOW_OBJECTS?: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  /**
   * Cron Trigger entry point: "只保留短期 Run" needs an actual scheduler,
   * not just the pure planWorkflowRetention()/applyWorkflowRetention()
   * functions. Wires them to a Worker Cron Trigger (see vite.config.ts's
   * `triggers.crons`, active once D1+R2 are bound) so terminal Runs lose
   * their source body after 24h and their full record after 30 days
   * without any manual step. No-ops safely when D1/R2 are not bound yet.
   */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.DB || !env.WORKFLOW_OBJECTS) return;
    const store = new DurableWorkflowStore(
      createD1WorkflowMetadataStore(env.DB as AnyD1Database),
      new R2ObjectStore(env.WORKFLOW_OBJECTS as R2BucketLike),
    );
    ctx.waitUntil(enforceWorkflowRetention(store).catch(() => {}));
  },
};

export default worker;
