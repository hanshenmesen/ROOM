import { NextResponse } from "next/server";

export const runtime = "edge";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

class MediaProxyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function unsafeIpv4(host: string) {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const unsafeIpv6 =
    host === "::" ||
    host === "::1" ||
    host.startsWith("::ffff:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("ff") ||
    host.startsWith("2001:db8:");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    unsafeIpv4(host) ||
    unsafeIpv6
  );
}

function validatedSourceUrl(value: string | URL) {
  let sourceUrl: URL;
  try {
    sourceUrl = value instanceof URL ? value : new URL(value);
  } catch {
    throw new MediaProxyError(400, "媒体地址无效。");
  }
  if (
    !["http:", "https:"].includes(sourceUrl.protocol) ||
    sourceUrl.username ||
    sourceUrl.password ||
    unsafeHost(sourceUrl.hostname) ||
    (sourceUrl.port && !["80", "443"].includes(sourceUrl.port))
  ) {
    throw new MediaProxyError(400, "不支持该媒体地址。");
  }
  return sourceUrl;
}

async function fetchWithValidatedRedirects(initialUrl: URL) {
  let sourceUrl = initialUrl;
  const signal = AbortSignal.timeout(9000);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(sourceUrl, {
      redirect: "manual",
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        "user-agent": "ROOM-Portfolio-Media/0.1",
      },
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) throw new MediaProxyError(502, "媒体重定向缺少目标地址。");
    sourceUrl = validatedSourceUrl(new URL(location, sourceUrl));
  }
  throw new MediaProxyError(502, "媒体重定向次数过多。");
}

async function readBoundedBody(response: Response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_MEDIA_BYTES) {
      await reader.cancel();
      throw new MediaProxyError(413, "媒体文件过大。");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const sourceUrl = validatedSourceUrl(requestUrl.searchParams.get("url") || "");
    const response = await fetchWithValidatedRedirects(sourceUrl);
    if (!response.ok) {
      return NextResponse.json({ error: `媒体返回 ${response.status}` }, { status: 502 });
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: "只支持常见位图格式。" }, { status: 415 });
    }
    if (declaredSize > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: "媒体文件过大。" }, { status: 413 });
    }

    const body = await readBoundedBody(response);
    return new NextResponse(body, {
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        "content-type": contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const status = error instanceof MediaProxyError ? error.status : isTimeout ? 504 : 502;
    const message = error instanceof MediaProxyError
      ? error.message
      : isTimeout
        ? "媒体读取超时。"
        : "媒体读取失败。";
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
