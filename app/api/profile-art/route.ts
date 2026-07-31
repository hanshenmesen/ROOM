import { NextResponse } from "next/server";
import {
  decodeBase64Image,
  extractPortraitImageBase64,
  getPortraitArtConfig,
  MAX_PORTRAIT_SOURCE_BYTES,
  PORTRAIT_ART_PROMPT,
  portraitArtProviderError,
} from "@/lib/portrait-art";

export const runtime = "edge";

const ALLOWED_PORTRAIT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.size) {
      return NextResponse.json({ error: "请选择一张有效的头像照片。" }, { status: 400 });
    }
    if (!ALLOWED_PORTRAIT_TYPES.has(image.type)) {
      return NextResponse.json({ error: "头像生成仅支持 JPEG、PNG 或 WebP。" }, { status: 415 });
    }
    if (image.size > MAX_PORTRAIT_SOURCE_BYTES) {
      return NextResponse.json({ error: "头像照片不能超过 8 MB。" }, { status: 413 });
    }

    const config = getPortraitArtConfig();
    if (!config.apiKey) {
      return NextResponse.json({ error: "抽象肖像服务尚未配置。" }, { status: 503 });
    }
    if (!config.baseUrl.startsWith("https://")) {
      return NextResponse.json({ error: "抽象肖像服务地址必须使用 HTTPS。" }, { status: 500 });
    }

    const providerForm = new FormData();
    providerForm.set("model", config.model);
    providerForm.set("prompt", PORTRAIT_ART_PROMPT);
    providerForm.set("image", image, image.name || "profile-photo.png");
    providerForm.set("size", "1024x1024");
    providerForm.set("quality", "low");
    providerForm.set("output_format", "png");

    const providerResponse = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
      },
      body: providerForm,
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await providerResponse.json().catch(() => null) as unknown;
    if (!providerResponse.ok) {
      const message = portraitArtProviderError(payload, `图像服务返回 ${providerResponse.status}。`);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const encodedImage = extractPortraitImageBase64(payload);
    if (!encodedImage) {
      return NextResponse.json({ error: "图像服务没有返回可用图片。" }, { status: 502 });
    }

    return new NextResponse(decodeBase64Image(encodedImage), {
      headers: {
        "cache-control": "no-store",
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
        "x-room-image-model": config.model,
      },
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException
      && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: isTimeout ? "抽象肖像生成超时，请重试。" : "抽象肖像生成失败，请稍后重试。" },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
