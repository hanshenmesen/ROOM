import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const MEDIA_ROUTE_URL = new URL("../app/api/media/route.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === MEDIA_ROUTE_URL) {
      const source = readFileSync(fileURLToPath(url), "utf8").replace(
        `  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }`,
        `  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.status = status;
  }`,
      );
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(source, { mode: "strip" }),
      };
    }
    return nextLoad(url, context);
  },
});

const { GET } = await import(MEDIA_ROUTE_URL);

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ABORT_TIMEOUT = AbortSignal.timeout;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function bytes(values: number[]) {
  const body = new Uint8Array(new ArrayBuffer(values.length));
  body.set(values);
  return body;
}

function byteLength(length: number) {
  return new Uint8Array(new ArrayBuffer(length));
}

function mediaRequest(source: string) {
  return new Request(`https://room.test/api/media?url=${encodeURIComponent(source)}`);
}

function imageResponse(body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(body.byteLength),
      ...headers,
    },
  });
}

function mockFetch(response: Response) {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    return Promise.resolve(response);
  }) as typeof fetch;
  return calls;
}

function mockFetchSequence(responses: Response[]) {
  const calls: Array<{ input: unknown; init?: RequestInit }> = [];
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    calls.push({ input, init });
    const response = responses.shift();
    assert.ok(response, `unexpected fetch call to ${String(input)}`);
    return Promise.resolve(response);
  }) as typeof fetch;
  return calls;
}

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  AbortSignal.timeout = ORIGINAL_ABORT_TIMEOUT;
});

test("returns proxied image bytes when HTTPS image response is safe", async () => {
  const body = bytes([137, 80, 78, 71]);
  mockFetch(imageResponse(body));

  const response = await GET(mediaRequest("https://cdn.example.com/avatar.png"));

  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body);
});

test("fetches safe HTTP images with manual redirect handling and media headers", async () => {
  const calls = mockFetch(imageResponse(bytes([1])));

  await GET(mediaRequest("http://images.example.com/photo.webp"));

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "http://images.example.com/photo.webp");
  assert.equal(calls[0]?.init?.redirect, "manual");
  assert.equal(calls[0]?.init?.headers?.["accept" as keyof HeadersInit], "image/avif,image/webp,image/png,image/jpeg,image/gif");
  assert.equal(calls[0]?.init?.headers?.["user-agent" as keyof HeadersInit], "ROOM-Portfolio-Media/0.1");
});

test("adds cache, content type, and nosniff headers to safe images", async () => {
  mockFetch(imageResponse(bytes([1]), { "content-type": "image/webp; charset=binary" }));

  const response = await GET(mediaRequest("https://cdn.example.com/cover.webp"));

  assert.equal(response.headers.get("cache-control"), "public, max-age=3600, stale-while-revalidate=86400");
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

for (const source of [
  "http://localhost/image.png",
  "http://127.0.0.1/image.png",
  "http://10.0.0.5/image.png",
  "http://172.16.0.1/image.png",
  "http://192.168.1.1/image.png",
  "http://169.254.1.1/image.png",
  "http://printer.local/image.png",
]) {
  test(`rejects localhost and private host ${source}`, async () => {
    const calls = mockFetch(imageResponse(bytes([1])));

    const response = await GET(mediaRequest(source));

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });
}

for (const source of [
  "http://192.0.2.10/image.png",
  "http://198.51.100.10/image.png",
  "http://203.0.113.10/image.png",
  "http://100.64.0.10/image.png",
  "http://224.0.0.1/image.png",
  "http://[::1]/image.png",
  "http://[fc00::1]/image.png",
  "http://[fe80::1]/image.png",
  "http://[::ffff:127.0.0.1]/image.png",
]) {
  test(`rejects reserved host ${source}`, async () => {
    const calls = mockFetch(imageResponse(bytes([1])));

    const response = await GET(mediaRequest(source));

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });
}

test("rejects non-HTTP protocols before fetching", async () => {
  const calls = mockFetch(imageResponse(bytes([1])));

  const response = await GET(mediaRequest("ftp://cdn.example.com/image.png"));

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects URLs with credentials before fetching", async () => {
  const calls = mockFetch(imageResponse(bytes([1])));

  const response = await GET(mediaRequest("https://user:pass@cdn.example.com/image.png"));

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects nonstandard ports before fetching", async () => {
  const calls = mockFetch(imageResponse(bytes([1])));

  const response = await GET(mediaRequest("https://cdn.example.com:8443/image.png"));

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects non-image content after fetching", async () => {
  mockFetch(new Response("<svg></svg>", { status: 200, headers: { "content-type": "text/html" } }));

  const response = await GET(mediaRequest("https://cdn.example.com/page.html"));

  assert.equal(response.status, 415);
});

test("rejects images whose declared size is too large without reading the body", async () => {
  let bodyAccessed = false;
  const response = new Response(null, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(MAX_MEDIA_BYTES + 1),
    },
  });
  Object.defineProperty(response, "body", {
    get() {
      bodyAccessed = true;
      return new ReadableStream<Uint8Array<ArrayBuffer>>();
    },
  });
  mockFetch(response);

  const result = await GET(mediaRequest("https://cdn.example.com/huge.png"));

  assert.equal(result.status, 413);
  assert.equal(bodyAccessed, false);
});

test("rejects images whose actual size is too large", async () => {
  mockFetch(imageResponse(byteLength(MAX_MEDIA_BYTES + 1), { "content-length": "0" }));

  const response = await GET(mediaRequest("https://cdn.example.com/huge.png"));

  assert.equal(response.status, 413);
});

test("follows a safe relative redirect to an image", async () => {
  const calls = mockFetchSequence([
    redirectResponse("/assets/photo.png"),
    imageResponse(bytes([2])),
  ]);

  const response = await GET(mediaRequest("https://cdn.example.com/start"));

  assert.equal(response.status, 200);
  assert.equal(String(calls[1]?.input), "https://cdn.example.com/assets/photo.png");
});

test("follows a safe absolute redirect to an image", async () => {
  const calls = mockFetchSequence([
    redirectResponse("https://img.example.org/photo.png"),
    imageResponse(bytes([3])),
  ]);

  const response = await GET(mediaRequest("https://cdn.example.com/start"));

  assert.equal(response.status, 200);
  assert.equal(String(calls[1]?.input), "https://img.example.org/photo.png");
});

for (const location of [
  "http://localhost/image.png",
  "http://10.0.0.5/image.png",
  "http://[::1]/image.png",
]) {
  test(`rejects redirect target ${location} before second fetch`, async () => {
    const calls = mockFetchSequence([redirectResponse(location)]);

    const response = await GET(mediaRequest("https://cdn.example.com/start"));

    assert.equal(response.status, 400);
    assert.equal(calls.length, 1);
  });
}

test("rejects redirect chains that exceed the redirect limit", async () => {
  const calls = mockFetchSequence([
    redirectResponse("/one"),
    redirectResponse("/two"),
    redirectResponse("/three"),
    redirectResponse("/four"),
    redirectResponse("/five"),
  ]);

  const response = await GET(mediaRequest("https://cdn.example.com/start"));

  assert.equal(response.status, 502);
  assert.equal(calls.length, 5);
});

test("rejects streamed images without content length when actual size is too large", async () => {
  mockFetch(new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(byteLength(MAX_MEDIA_BYTES));
        controller.enqueue(bytes([1]));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "image/png" } },
  ));

  const response = await GET(mediaRequest("https://cdn.example.com/stream.png"));

  assert.equal(response.status, 413);
});

test("uses a bounded timeout signal when fetching remote media", async () => {
  const timeoutSignal = new AbortController().signal;
  AbortSignal.timeout = ((milliseconds: number) => {
    assert.equal(milliseconds, 9000);
    return timeoutSignal;
  }) as typeof AbortSignal.timeout;
  const calls = mockFetch(imageResponse(bytes([1])));

  await GET(mediaRequest("https://cdn.example.com/photo.png"));

  assert.equal(calls[0]?.init?.signal, timeoutSignal);
});
