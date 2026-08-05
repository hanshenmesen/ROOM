import assert from "node:assert/strict";
import test from "node:test";
import { fetchPublicWebPage } from "../../lib/public-web.ts";

test("every redirect target is re-authorized and DNS checked before contact", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(null, { status: 302, headers: { location: "https://rebinding.example/private" } });
  }) as typeof fetch;
  try {
    await assert.rejects(fetchPublicWebPage("https://portfolio.example/", {
      resolveHost: async (host) => host === "portfolio.example" ? ["93.184.216.34"] : ["10.0.0.9"],
    }), /非公开网络地址/);
    assert.deepEqual(calls, ["https://portfolio.example/"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
