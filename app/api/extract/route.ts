import { NextResponse } from "next/server";
import { extractWebPage } from "@/lib/extract-webpage";

export const runtime = "edge";

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    const url = new URL(body.url || "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return NextResponse.json({ error: "只支持不带凭据的 HTTP(S) 公开网页。" }, { status: 400 });
    }
    if (unsafeHost(url.hostname) || (url.port && !["80", "443"].includes(url.port))) {
      return NextResponse.json({ error: "不能提取本地网络或非标准端口。" }, { status: 400 });
    }
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "ROOM-Portfolio-Parser/0.1" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`目标网页返回 ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("text/plain")) {
      return NextResponse.json({ error: "MVP 目前只提取 HTML 或纯文本。" }, { status: 415 });
    }
    const html = (await response.text()).slice(0, 1_000_000);
    if (!type.includes("text/html")) {
      return NextResponse.json({ title: url.hostname, text: html.slice(0, 80_000), media: [] });
    }
    return NextResponse.json(extractWebPage(html, response.url || url.href));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? `无法提取：${error.message}` : "无法提取网页。" },
      { status: 400 },
    );
  }
}
