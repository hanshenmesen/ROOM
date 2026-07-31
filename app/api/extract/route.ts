import { NextResponse } from "next/server";
import { extractWebPage } from "@/lib/extract-webpage";
import { fetchPublicWebPage, PublicWebError } from "@/lib/public-web";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    const page = await fetchPublicWebPage(body.url || "");
    if (!page.contentType.includes("text/html")) {
      return NextResponse.json({ title: new URL(page.url).hostname, text: page.text.slice(0, 160_000), media: [] });
    }
    return NextResponse.json(extractWebPage(page.text, page.url));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? `无法提取：${error.message}` : "无法提取网页。" },
      { status: error instanceof PublicWebError ? error.status : 400 },
    );
  }
}
