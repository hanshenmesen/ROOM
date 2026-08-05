import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROUTE_URL = new URL("../app/api/profile-art/route.ts", import.meta.url).href;
const HELPER_URL = new URL("../lib/portrait-art.ts", import.meta.url).href;
const BROWSER_CONFIG_URL = new URL("../lib/browser-agent-config.ts", import.meta.url).href;
const PUBLIC_WEB_URL = new URL("../lib/public-web.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/portrait-art") return { url: HELPER_URL, shortCircuit: true };
    if (specifier === "@/lib/browser-agent-config") return { url: BROWSER_CONFIG_URL, shortCircuit: true };
    if (specifier === "@/lib/public-web") return { url: PUBLIC_WEB_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if ([ROUTE_URL, HELPER_URL, BROWSER_CONFIG_URL, PUBLIC_WEB_URL].includes(url)) {
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "strip" }),
      };
    }
    return nextLoad(url, context);
  },
});

const { POST } = await import(ROUTE_URL);
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  imageKey: process.env.IMAGE_MAAS_API_KEY,
  imageBaseUrl: process.env.IMAGE_MAAS_BASE_URL,
  imageModel: process.env.IMAGE_MAAS_MODEL,
  maasKey: process.env.MAAS_API_KEY,
};

function requestWithImage(type = "image/png", headers?: HeadersInit) {
  const form = new FormData();
  form.set("image", new File([new Uint8Array([137, 80, 78, 71])], "profile.png", { type }));
  return new Request("https://room.test/api/profile-art", { method: "POST", headers, body: form });
}

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const [name, value] of [
    ["IMAGE_MAAS_API_KEY", ORIGINAL_ENV.imageKey],
    ["IMAGE_MAAS_BASE_URL", ORIGINAL_ENV.imageBaseUrl],
    ["IMAGE_MAAS_MODEL", ORIGINAL_ENV.imageModel],
    ["MAAS_API_KEY", ORIGINAL_ENV.maasKey],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("sends an identity-preserving image edit and returns PNG bytes", async () => {
  process.env.IMAGE_MAAS_API_KEY = "test-image-key";
  process.env.IMAGE_MAAS_BASE_URL = "https://maas.example.test/hackson";
  process.env.IMAGE_MAAS_MODEL = "gpt-image-2";
  let providerForm: FormData | undefined;
  let providerHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://maas.example.test/hackson/v1/images/edits");
    providerForm = init?.body as FormData;
    providerHeaders = init?.headers;
    return Response.json({ data: [{ b64_json: btoa(String.fromCharCode(137, 80, 78, 71)) }] });
  }) as typeof fetch;

  const response = await POST(requestWithImage());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [137, 80, 78, 71]);
  assert.equal(providerForm?.get("model"), "gpt-image-2");
  assert.equal(providerForm?.get("size"), "1024x1024");
  assert.equal(providerForm?.get("quality"), "low");
  assert.equal(providerForm?.get("input_fidelity"), null);
  assert.match(String(providerForm?.get("prompt")), /playful, highly abstract black-and-white line-art face/i);
  assert.deepEqual(providerHeaders, { authorization: "Bearer test-image-key" });
});

test("does not call the provider without a server-side key", async () => {
  delete process.env.IMAGE_MAAS_API_KEY;
  delete process.env.MAAS_API_KEY;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({});
  }) as typeof fetch;

  const response = await POST(requestWithImage());
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 503);
  assert.equal(payload.error, "抽象肖像服务尚未配置。");
  assert.equal(calls, 0);
});

test("uses the browser-session image provider without mixing server settings", async () => {
  process.env.IMAGE_MAAS_API_KEY = "server-key";
  process.env.IMAGE_MAAS_BASE_URL = "https://server.example.test";
  process.env.IMAGE_MAAS_MODEL = "server-model";
  let providerForm: FormData | undefined;
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith("https://cloudflare-dns.com/dns-query")) {
      return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    }
    assert.equal(String(input), "https://browser.example.test/v1/images/edits");
    providerForm = init?.body as FormData;
    authorization = new Headers(init?.headers).get("authorization") || "";
    return Response.json({ data: [{ b64_json: btoa("png") }] });
  }) as typeof fetch;

  const response = await POST(requestWithImage("image/png", {
    "x-room-image-api-key": "browser-key",
    "x-room-image-base-url": "https://browser.example.test/v1",
    "x-room-image-model": "browser-model",
  }));

  assert.equal(response.status, 200);
  assert.equal(providerForm?.get("model"), "browser-model");
  assert.equal(authorization, "Bearer browser-key");
});

test("rejects a private browser-session image provider before calling it", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({});
  }) as typeof fetch;

  const response = await POST(requestWithImage("image/png", {
    "x-room-image-api-key": "browser-key",
    "x-room-image-base-url": "https://localhost/v1",
    "x-room-image-model": "browser-model",
  }));
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "图像服务 Base URL 必须是公开的 HTTPS 地址。");
  assert.equal(calls, 0);
});

test("rejects unsupported source image formats before calling the provider", async () => {
  process.env.IMAGE_MAAS_API_KEY = "test-image-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({});
  }) as typeof fetch;

  const response = await POST(requestWithImage("image/gif"));

  assert.equal(response.status, 415);
  assert.equal(calls, 0);
});

test("maps provider errors without exposing the configured key", async () => {
  process.env.IMAGE_MAAS_API_KEY = "do-not-expose-this-key";
  globalThis.fetch = (async () => Response.json(
    { error: { message: "model unavailable" } },
    { status: 503 },
  )) as typeof fetch;

  const response = await POST(requestWithImage());
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 502);
  assert.equal(payload.error, "model unavailable");
  assert.doesNotMatch(JSON.stringify(payload), /do-not-expose-this-key/);
});
