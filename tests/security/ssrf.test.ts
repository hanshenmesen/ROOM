import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicResolvedAddresses,
  fetchPublicWebPage,
  validatePublicUrl,
} from "../../lib/public-web.ts";

test("literal and DNS-resolved private addresses are rejected before a page request", async () => {
  assert.throws(() => validatePublicUrl("http://127.0.0.1/secrets"));
  assert.throws(() => assertPublicResolvedAddresses("rebinding.example", ["10.0.0.8"]));

  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response("should not be read");
  }) as typeof fetch;
  try {
    await assert.rejects(fetchPublicWebPage("https://rebinding.example/", {
      resolveHost: async () => ["192.168.1.9"],
    }), /非公开网络地址/);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
