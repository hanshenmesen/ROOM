import { NextResponse } from "next/server";
import {
  answerPetQaQuestion,
  MAX_PET_QA_QUESTION_CHARACTERS,
  PetQaError,
} from "@/lib/agents/pet-qa";
import type { AgentProviderOverride } from "@/lib/agents/provider-config";
import { readBrowserPetQaConfigHeaders } from "@/lib/browser-agent-config";
import { normalizePetPersonality } from "@/lib/profile-space-customization";
import { normalizeRoomCompanionName } from "@/lib/room-companion";
import { validatePublicUrl, validatePublicUrlResolution } from "@/lib/public-web";
import type { ParsedProfile } from "@/lib/types";
import { privacySafeRequestKey, tryAcquireConcurrencyLease } from "@/lib/agent-runtime/concurrency-limiter";

export const runtime = "edge";

type PetQaBody = {
  question?: unknown;
  profile?: unknown;
  history?: unknown;
  name?: unknown;
  personality?: unknown;
};

async function requestProviderConfig(request: Request): Promise<AgentProviderOverride | undefined> {
  const config = readBrowserPetQaConfigHeaders(request.headers);
  if (!config) return undefined;
  if (config.petQaApiKey.length > 1_024) throw new PetQaError("Pet QA API Key 长度不合法。", 400);
  if (config.petQaModel.length > 200) throw new PetQaError("Pet QA 模型名称过长。", 400);
  try {
    const url = validatePublicUrl(config.petQaBaseUrl);
    if (url.protocol !== "https:" || url.search || url.hash) throw new Error("unsafe provider URL");
    await validatePublicUrlResolution(url, { signal: request.signal });
    return { ...config, petQaBaseUrl: url.href.replace(/\/$/, "") };
  } catch {
    throw new PetQaError("宠物 QA Base URL 必须是公开的 HTTPS 地址。", 400);
  }
}

function isParsedProfile(value: unknown): value is ParsedProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<ParsedProfile>;
  return typeof profile.id === "string"
    && typeof profile.name === "string"
    && typeof profile.headline === "string"
    && typeof profile.summary === "string"
    && Array.isArray(profile.contacts)
    && Array.isArray(profile.skills)
    && Array.isArray(profile.media)
    && Array.isArray(profile.items)
    && Boolean(profile.source && typeof profile.source === "object");
}

export async function POST(request: Request) {
  const requestKey = await privacySafeRequestKey(request);
  const releaseLease = tryAcquireConcurrencyLease(`pet-qa:${requestKey}`, 3);
  if (!releaseLease) {
    return NextResponse.json({ error: "当前 Companion 请求较多，请稍后重试。" }, { status: 429 });
  }
  try {
    const providerOverride = await requestProviderConfig(request);
    const body = await request.json() as PetQaBody;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return NextResponse.json({ error: "请先输入一个问题。" }, { status: 400 });
    }
    if (question.length > MAX_PET_QA_QUESTION_CHARACTERS) {
      return NextResponse.json({ error: `问题请控制在 ${MAX_PET_QA_QUESTION_CHARACTERS} 字以内。` }, { status: 400 });
    }
    if (!isParsedProfile(body.profile)) {
      return NextResponse.json({ error: "缺少可用于回答的公开 Profile。" }, { status: 400 });
    }

    const answer = await answerPetQaQuestion(
      body.profile,
      question,
      body.history,
      providerOverride,
      normalizePetPersonality(body.personality),
      normalizeRoomCompanionName(body.name),
      { signal: request.signal },
    );
    return NextResponse.json(answer, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name);
    if (timedOut) {
      return NextResponse.json({ error: "宠物 QA 请求超时，请重试。" }, { status: 504 });
    }
    if (error instanceof PetQaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Companion 预算已用尽。" }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "宠物 QA 请求失败。" },
      { status: 502 },
    );
  } finally {
    releaseLease();
  }
}
