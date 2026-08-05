import assert from "node:assert/strict";
import test from "node:test";
import {
  extractProfileFromAttachmentWithAgentRun,
  extractProfileWithAgentRun,
  MAX_SOURCE_CHARACTERS,
  ProfileAgentError,
} from "../../lib/agents/profile-agent.ts";
import { fetchPublicWebPage } from "../../lib/public-web.ts";

test("oversized text and preparsed PDF content stop before model calls", async () => {
  const oversized = "x".repeat(MAX_SOURCE_CHARACTERS + 1);
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response();
  }) as typeof fetch;
  try {
    await assert.rejects(() => extractProfileWithAgentRun(oversized), (error) => (
      error instanceof ProfileAgentError && error.status === 413
    ));
    await assert.rejects(() => extractProfileFromAttachmentWithAgentRun(
      { mediaType: "application/pdf", data: "cGRm" },
      { format: "pdf" },
      oversized,
    ), (error) => error instanceof ProfileAgentError && error.status === 413);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("oversized HTML is rejected from headers before reading the body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("tiny", {
    headers: { "content-type": "text/html", "content-length": "2000000" },
  })) as typeof fetch;
  try {
    await assert.rejects(fetchPublicWebPage("https://portfolio.example/", {
      maxBytes: 1_000,
      resolveHost: async () => ["93.184.216.34"],
    }), (error) => Boolean(error && typeof error === "object" && "status" in error && error.status === 413));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
