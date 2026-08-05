const MAX_REDIRECTS = 4;
const MAX_SOURCE_BYTES = 1_500_000;

export class PublicWebError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublicWebError";
    this.status = status;
  }
}

function unsafeIpv4(host: string) {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
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
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    unsafeIpv4(host) ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("::ffff:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("ff") ||
    host.startsWith("2001:db8:")
  );
}

export function assertPublicResolvedAddresses(hostname: string, addresses: Iterable<string>) {
  const resolved = [...addresses].map((address) => address.trim()).filter(Boolean);
  if (!resolved.length) throw new PublicWebError(`无法验证 ${hostname} 的公开 DNS 地址。`, 502);
  const malformedAddress = resolved.find((address) => {
    if (/^\d+(?:\.\d+){3}$/.test(address)) {
      return address.split(".").some((part) => Number(part) < 0 || Number(part) > 255);
    }
    if (!address.includes(":")) return true;
    try {
      return !new URL(`http://[${address}]/`).hostname.includes(":");
    } catch {
      return true;
    }
  });
  if (malformedAddress) throw new PublicWebError(`无法验证 ${hostname} 的 DNS 地址。`, 502);
  const unsafeAddress = resolved.find((address) => unsafeHost(address));
  if (unsafeAddress) {
    throw new PublicWebError(`域名 ${hostname} 解析到了非公开网络地址。`);
  }
  return resolved;
}

export type PublicHostResolver = (hostname: string, signal: AbortSignal) => Promise<string[]>;

type DnsJsonResponse = {
  Answer?: Array<{ type?: number; data?: string }>;
};

export const resolvePublicHostWithDoh: PublicHostResolver = async (hostname, signal) => {
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) return [hostname];
  const query = async (type: "A" | "AAAA") => {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new PublicWebError("公开 DNS 校验服务不可用。", 502);
    const payload = await response.json() as DnsJsonResponse;
    return (payload.Answer || [])
      .filter((answer) => answer.type === 1 || answer.type === 28)
      .map((answer) => answer.data || "")
      .filter(Boolean);
  };
  const addresses = (await Promise.all([query("A"), query("AAAA")])).flat();
  return assertPublicResolvedAddresses(hostname, addresses);
};

export async function validatePublicUrlResolution(
  value: string | URL,
  options: { signal?: AbortSignal; resolveHost?: PublicHostResolver; timeoutMs?: number } = {},
) {
  const url = validatePublicUrl(value);
  const timeout = AbortSignal.timeout(Math.min(10_000, Math.max(1, options.timeoutMs || 5_000)));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const addresses = await (options.resolveHost || resolvePublicHostWithDoh)(url.hostname, signal);
  assertPublicResolvedAddresses(url.hostname, addresses);
  return url;
}

export function validatePublicUrl(value: string | URL) {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new PublicWebError("网页地址无效。");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    unsafeHost(url.hostname) ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new PublicWebError("不能读取本地网络、带凭据或非标准端口的网页。");
  }
  return url;
}

export type PublicWebFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  authorizeUrl?: (url: URL) => void;
  resolveHost?: PublicHostResolver;
  signal?: AbortSignal;
};

async function readBoundedText(response: Response, maxBytes: number) {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new PublicWebError("目标网页内容过大。", 413);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PublicWebError("目标网页内容过大。", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchPublicWebPage(value: string | URL, options: PublicWebFetchOptions = {}) {
  let url = validatePublicUrl(value);
  const maxBytes = Math.min(MAX_SOURCE_BYTES, Math.max(1, options.maxBytes || MAX_SOURCE_BYTES));
  const timeoutSignal = AbortSignal.timeout(Math.min(30_000, Math.max(1, options.timeoutMs || 12_000)));
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  const resolveHost = options.resolveHost || resolvePublicHostWithDoh;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    options.authorizeUrl?.(url);
    const addresses = await resolveHost(url.hostname, signal);
    assertPublicResolvedAddresses(url.hostname, addresses);
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/html,text/plain;q=0.9",
        "user-agent": "ROOM-Profile-Agent/0.2",
      },
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new PublicWebError("网页重定向缺少目标地址。", 502);
      url = validatePublicUrl(new URL(location, url));
      continue;
    }
    if (!response.ok) throw new PublicWebError(`目标网页返回 ${response.status}。`, 502);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new PublicWebError("个人网站不是可读取的 HTML 或纯文本。", 415);
    }
    return {
      url: url.href,
      contentType,
      text: await readBoundedText(response, maxBytes),
    };
  }
  throw new PublicWebError("网页重定向次数过多。", 502);
}
