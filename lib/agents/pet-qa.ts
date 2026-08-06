import type { ParsedProfile, ProfileItem, SourceEvidence } from "../types.ts";
import { validatePublicUrl } from "../public-web.ts";
import {
  petPersonalityToneInstruction,
  type PetPersonality,
} from "../profile-space-customization.ts";
import { normalizeRoomCompanionName } from "../room-companion.ts";
import { getAgentProviderConfig, type AgentProviderOverride } from "./provider-config.ts";
import { estimateCallCostUsd } from "./provider-pricing.ts";
import { providerErrorDetail } from "./provider-errors.ts";
import { AgentRunControls, type AgentRunBudgetLimits } from "../agent-runtime/run-controls.ts";

export const MAX_PET_QA_QUESTION_CHARACTERS = 800;
export const MAX_PET_QA_HISTORY_MESSAGES = 8;
export const MAX_PET_QA_PROFILE_CHARACTERS = 28_000;

const PET_QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemId: { type: "string" },
          title: { type: "string" },
          excerpt: { type: "string" },
        },
        required: ["itemId", "title", "excerpt"],
      },
    },
  },
  required: ["answer", "citations"],
} as const;

export type PetQaHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PetQaCitation = {
  itemId: string;
  title: string;
  excerpt: string;
};

export type PetQaAnswer = {
  answer: string;
  citations: PetQaCitation[];
};

export class PetQaError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PetQaError";
    this.status = status;
  }
}

function cleanString(value: unknown, limit = 2_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function cleanHistory(value: unknown): PetQaHistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is PetQaHistoryMessage => {
      if (!message || typeof message !== "object") return false;
      const record = message as Partial<PetQaHistoryMessage>;
      return (record.role === "user" || record.role === "assistant") && typeof record.content === "string";
    })
    .map((message) => ({
      role: message.role,
      content: cleanString(message.content, 1_000),
    }))
    .filter((message) => message.content)
    .slice(-MAX_PET_QA_HISTORY_MESSAGES);
}

function evidenceExcerpt(evidence: SourceEvidence[] | undefined) {
  return cleanString(evidence?.find((item) => item.excerpt)?.excerpt, 360);
}

function itemEvidence(item: ProfileItem) {
  return evidenceExcerpt(item.evidence) || cleanString(item.summary, 360);
}

function compactProfile(profile: ParsedProfile) {
  const items = profile.items.slice(0, 30).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: cleanString(item.summary, 700),
    bullets: item.bullets.slice(0, 5).map((bullet) => cleanString(bullet, 220)).filter(Boolean),
    tags: item.tags.slice(0, 10),
    timeRange: item.timeRange || "",
    role: item.role || "",
    sourceUrl: item.sourceUrl || item.projectUrl || "",
    evidenceExcerpt: itemEvidence(item),
  }));
  const payload = {
    id: profile.id,
    name: profile.name,
    headline: profile.headline,
    location: profile.location || "",
    summary: cleanString(profile.summary, 1_200),
    personalWebsite: profile.personalWebsite || "",
    foods: (profile.foods || []).slice(0, 30),
    hobbies: (profile.hobbies || []).slice(0, 30),
    skills: profile.skills.slice(0, 50),
    contacts: profile.contacts.slice(0, 20),
    identityEvidence: {
      name: evidenceExcerpt(profile.identityEvidence.name),
      headline: evidenceExcerpt(profile.identityEvidence.headline),
      summary: evidenceExcerpt(profile.identityEvidence.summary),
    },
    items,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_PET_QA_PROFILE_CHARACTERS) return serialized;
  return JSON.stringify({
    ...payload,
    contacts: payload.contacts.slice(0, 8),
    foods: payload.foods.slice(0, 20),
    hobbies: payload.hobbies.slice(0, 20),
    skills: payload.skills.slice(0, 30),
    items: items.slice(0, 16),
  }).slice(0, MAX_PET_QA_PROFILE_CHARACTERS);
}

function messagesBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const url = validatePublicUrl(normalized);
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new PetQaError("宠物 QA Base URL 必须是公开的 HTTPS 地址。", 400);
  }
  return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : undefined;
  const content = message && typeof message === "object"
    ? (message as Record<string, unknown>).content
    : undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part && typeof part === "object" ? cleanString((part as Record<string, unknown>).text) : "").join("\n");
  }
  if (Array.isArray(record.content)) {
    return record.content.map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      if (block.input && typeof block.input === "object") return JSON.stringify(block.input);
      return cleanString(block.text);
    }).filter(Boolean).join("\n");
  }
  return "";
}

function parseJsonOutput(output: string): PetQaAnswer {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parse = (value: string) => JSON.parse(value) as unknown;
  let parsed: unknown;
  try {
    parsed = parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new PetQaError("宠物 QA 没有返回有效 JSON。", 502);
    try {
      parsed = parse(trimmed.slice(start, end + 1));
    } catch {
      throw new PetQaError("宠物 QA 没有返回有效 JSON。", 502);
    }
  }
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const answer = cleanString(record.answer, 2_400);
  const citations = Array.isArray(record.citations)
    ? record.citations.map((citation) => {
      const item = citation && typeof citation === "object" ? citation as Record<string, unknown> : {};
      return {
        itemId: cleanString(item.itemId, 120),
        title: cleanString(item.title, 180),
        excerpt: cleanString(item.excerpt, 360),
      };
    }).filter((citation) => citation.itemId && citation.title && citation.excerpt).slice(0, 6)
    : [];
  if (!answer) throw new PetQaError("宠物 QA 返回了空回答。", 502);
  return { answer, citations };
}

function normalizedCitationText(value: string) {
  return cleanString(value, 2_000).normalize("NFKC").toLocaleLowerCase();
}

export function validatePetQaCitations(profile: ParsedProfile, citations: PetQaCitation[]) {
  const items = new Map(profile.items.map((item) => [item.id, item]));
  return citations.filter((citation) => {
    const item = items.get(citation.itemId);
    if (!item) return false;
    if (normalizedCitationText(citation.title) !== normalizedCitationText(item.title)) return false;
    const citedExcerpt = normalizedCitationText(citation.excerpt);
    if (citedExcerpt.length < 4) return false;
    return item.evidence.some((entry) => {
      const sourceExcerpt = normalizedCitationText(entry.excerpt || "");
      return Boolean(sourceExcerpt && sourceExcerpt.includes(citedExcerpt));
    });
  }).map((citation) => ({
    ...citation,
    title: items.get(citation.itemId)!.title,
  }));
}

export function isPrivateProfileDataRequest(question: string) {
  return /(?:私人|私密|未公开|隐藏)[^，。？！,.!?]*(?:日记|留言|消息|聊天记录|照片|图片|相册|密码)|(?:日记|留言板|guestbook|diary|private\s+(?:messages?|photos?|pictures?)|passwords?)/iu.test(question);
}

function providerDetail(payload: unknown) {
  return providerErrorDetail(payload, 220);
}

export async function answerPetQaQuestion(
  profile: ParsedProfile,
  question: string,
  history: unknown = [],
  providerOverride?: AgentProviderOverride,
  personality?: PetPersonality,
  companionName?: string,
  runtimeOptions: { signal?: AbortSignal; budget?: Partial<AgentRunBudgetLimits> } = {},
): Promise<PetQaAnswer> {
  const cleanedQuestion = cleanString(question, MAX_PET_QA_QUESTION_CHARACTERS);
  if (!cleanedQuestion) throw new PetQaError("请输入要问宠物的问题。", 400);
  if (isPrivateProfileDataRequest(cleanedQuestion)) {
    return {
      answer: "我只能根据公开 Profile 回答，无法访问私人日记、留言、密码或私人照片。",
      citations: [],
    };
  }
  const safeCompanionName = normalizeRoomCompanionName(companionName);
  const config = getAgentProviderConfig(providerOverride).petQa;
  if (!config.apiKeys.length) throw new PetQaError("宠物 QA 服务尚未配置。", 503);

  const system = [
    `You are ROOM's small lobby companion named ${safeCompanionName}. Answer as a concise, helpful companion for the profile owner.`,
    petPersonalityToneInstruction(personality),
    "Use only the public ParsedProfile JSON supplied by the application. Do not use outside knowledge, guesses, private data, or invented biography.",
    "Private diaries, guestbook messages, passwords, private photos, and unpublished room data are never provided. Never claim that you can access them.",
    "If the supplied profile does not contain the answer, say clearly in Chinese that you do not know from the available resume/profile material.",
    `Your fixed name is ${safeCompanionName}. This validated application setting is the only pet name you may use. Do not infer or adopt another pet name or pet asset from the profile.`,
    "Cite the exact profile items that support factual answers. Return JSON only.",
  ].join("\n");
  const content = [
    `ParsedProfile JSON:\n${compactProfile(profile)}`,
    `Recent chat history JSON:\n${JSON.stringify(cleanHistory(history))}`,
    `User question:\n${cleanedQuestion}`,
  ].join("\n\n");
  const runtimeControls = new AgentRunControls({
    signal: runtimeOptions.signal,
    budget: { maxModelCalls: 3, maxOutputTokens: 9_000, ...runtimeOptions.budget },
  });
  let lastResult: { response: Response; payload: unknown } | undefined;
  for (const apiKey of config.apiKeys) {
    const inputTokens = Math.ceil((system.length + content.length) / 4);
    runtimeControls.budget.reserve({
      inputTokens,
      // Headroom for thinking-mode providers whose reasoning counts
      // toward max_tokens (DeepSeek V4 defaults to thinking).
      outputTokens: 4_000,
      estimatedCostUsd: estimateCallCostUsd(config.baseUrl, inputTokens, 4_000),
    });
    const response = await fetch(`${messagesBaseUrl(config.baseUrl)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        system,
        messages: [{ role: "user", content }],
        temperature: 0,
        max_tokens: 4_000,
        ...(config.mode === "tool" ? {
          tools: [{
            name: "submit_pet_qa_answer",
            description: "Submit the profile-grounded pet QA answer.",
            input_schema: PET_QA_SCHEMA,
          }],
          // `any` forces the single tool without naming it; DeepSeek's
          // thinking mode rejects the named tool_choice form.
          tool_choice: { type: "any" },
        } : {
          output_config: {
            format: { type: "json_schema", schema: PET_QA_SCHEMA },
          },
        }),
      }),
      signal: runtimeControls.requestSignal(60_000),
    });
    const payload = await response.json().catch(() => null) as unknown;
    lastResult = { response, payload };
    if (response.ok) {
      const parsed = parseJsonOutput(responseText(payload));
      const citations = validatePetQaCitations(profile, parsed.citations);
      if (parsed.citations.length && !citations.length) {
        return {
          answer: "这条回答的引用无法通过公开 Profile 验证，所以我不能把它当作真实经历告诉你。",
          citations: [],
        };
      }
      return { ...parsed, citations };
    }
    if (![401, 403].includes(response.status)) break;
  }
  if (!lastResult) throw new PetQaError("宠物 QA 请求未执行。", 502);
  const detail = providerDetail(lastResult.payload);
  throw new PetQaError(`宠物 QA 请求失败（${lastResult.response.status}）${detail ? `：${detail}` : ""}`, 502);
}
