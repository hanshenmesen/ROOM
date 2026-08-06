import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicResolvedAddresses,
  fetchPublicWebPage,
  resolvePublicHostWithDoh,
  validatePublicUrl,
} from "../../lib/public-web.ts";

test("the DoH resolver uses an edge-compatible redirect mode and rejects redirects", async () => {
  // workerd only implements redirect "follow" | "manual"; the previous
  // "error" value threw a TypeError at the edge and broke browser-supplied
  // provider configs while Node tests stayed green. Pin the contract.
  const originalFetch = globalThis.fetch;
  const redirectModes: Array<string | undefined> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    redirectModes.push(init?.redirect);
    const url = new URL(String(input));
    if (url.searchParams.get("type") === "AAAA") return Response.json({ Answer: [] });
    return Response.json({ Answer: [{ type: 1, data: "3.173.21.63" }] });
  }) as typeof fetch;
  try {
    const addresses = await resolvePublicHostWithDoh("api.deepseek.com", new AbortController().signal);
    assert.deepEqual(addresses, ["3.173.21.63"]);
    assert.ok(redirectModes.length >= 2, "A and AAAA should both be queried");
    assert.ok(redirectModes.every((mode) => mode === "manual"));
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => new Response(null, {
    status: 302,
    headers: { location: "https://evil.example/dns-query" },
  })) as typeof fetch;
  try {
    await assert.rejects(
      resolvePublicHostWithDoh("api.deepseek.com", new AbortController().signal),
      /重定向/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the DoH resolver filters CNAME hops and keeps only A/AAAA answers", async () => {
  // Mirrors the real api.deepseek.com response shape: a CNAME to CloudFront
  // in both answers, with the A record only present in the A query.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.searchParams.get("type") === "AAAA") {
      return Response.json({ Answer: [{ name: "api.deepseek.com", type: 5, data: "d3bbv8sr76az5s.cloudfront.net." }] });
    }
    return Response.json({
      Answer: [
        { name: "api.deepseek.com", type: 5, data: "d3bbv8sr76az5s.cloudfront.net." },
        { name: "d3bbv8sr76az5s.cloudfront.net", type: 1, data: "3.173.21.63" },
      ],
    });
  }) as typeof fetch;
  try {
    const addresses = await resolvePublicHostWithDoh("api.deepseek.com", new AbortController().signal);
    assert.deepEqual(addresses, ["3.173.21.63"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the DoH resolver reports an unavailable validator as a 502", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("upstream down", { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(
      resolvePublicHostWithDoh("api.deepseek.com", new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /不可用/);
        assert.equal((error as { status?: number }).status, 502);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
