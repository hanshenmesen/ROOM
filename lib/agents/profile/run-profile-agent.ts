import { createAgentTracer } from "../../agent-runtime/tracer.ts";
import type { AgentRunSnapshot } from "../../agent-runtime/run-types.ts";
import { AgentBudgetExceededError, AgentRunControls } from "../../agent-runtime/run-controls.ts";
import type { ParsedProfile } from "../../types.ts";
import { normalizeProfileDraft } from "./normalize.ts";
import { PROFILE_PROMPT_VERSIONS, systemPrompt, userPrompt } from "./prompts.ts";
import { callProfileModel } from "./provider.ts";
import { IDENTITY_DRAFT_SCHEMA, ITEMS_DRAFT_SCHEMA } from "./schemas.ts";
import { inventoryExpectations, planInventoryShards } from "./shard-planner.ts";
import { quarantineSourceInstructions } from "../source-security.ts";
import type {
  AgentAttachment,
  AgentProfileDraft,
  ExtractionShard,
  MaasContentBlock,
  ProfileAgentOptions,
  ProfileAgentSource,
} from "./types.ts";
import { ProfileAgentError } from "./types.ts";
import { cleanString, safeHttpUrl } from "./utils.ts";

export const MAX_SOURCE_CHARACTERS = 160_000;
const MAX_AGENT_ATTEMPTS = 2;

export type ProfileAgentRunResult = {
  profile: ParsedProfile;
  run: AgentRunSnapshot;
};

function errorCode(error: unknown) {
  if (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name)) return "timeout";
  if (error instanceof ProfileAgentError) return `profile_agent_${error.status}`;
  return "profile_agent_failed";
}

function inventoryItem(item: Record<string, unknown>) {
  return {
    kind: item.kind,
    contentFamily: item.contentFamily || null,
    title: item.title,
    subtitle: item.subtitle || null,
    summary: item.detail,
    bullets: Array.isArray(item.bullets) ? item.bullets : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    mediaIndex: item.mediaIndex ?? null,
    sourceUrl: item.sourceUrl || null,
    timeRange: item.timeRange || null,
    role: item.role || null,
    techStack: Array.isArray(item.techStack) ? item.techStack : [],
    projectUrl: item.projectUrl || null,
    evidenceLines: item.evidenceLines,
    evidenceExcerpt: item.evidenceExcerpt,
    ...(item.fieldEvidence && typeof item.fieldEvidence === "object"
      ? { fieldEvidence: item.fieldEvidence }
      : {}),
  };
}

export async function runProfileAgent(
  text: string,
  source: ProfileAgentSource,
  attachment?: AgentAttachment,
  options: ProfileAgentOptions = {},
): Promise<ProfileAgentRunResult> {
  const preparedSource = quarantineSourceInstructions(text);
  const normalized = preparedSource.text;
  if (!normalized.trim() && !attachment) throw new ProfileAgentError("没有可供 Agent 解析的内容。", 400);
  if (normalized.length > MAX_SOURCE_CHARACTERS) {
    throw new ProfileAgentError(`来源内容过长，当前上限为 ${MAX_SOURCE_CHARACTERS.toLocaleString()} 个字符。`, 413);
  }
  const ownsTracer = !options.tracer;
  const tracer = options.tracer || createAgentTracer(options.runId);
  tracer.start();
  if (preparedSource.findings.length) {
    tracer.emit({
      type: "security.input_quarantined",
      step: options.stepPrefix || "profile",
      count: preparedSource.findings.length,
      categories: [...new Set(preparedSource.findings.map((finding) => finding.category))],
    });
  }
  const expectations = inventoryExpectations(normalized);
  const inventoryShards = planInventoryShards(expectations);
  const runtimeControls = options.runtimeControls || new AgentRunControls({
    budget: options.budget,
    signal: options.signal,
  });
  let previousErrors: string[] | undefined;

  try {
    for (let attemptIndex = 0; attemptIndex < MAX_AGENT_ATTEMPTS; attemptIndex += 1) {
      const attempt = attemptIndex + 1;
      const contentFor = (shard: ExtractionShard): string | MaasContentBlock[] => {
        const prompt = userPrompt(normalized, source, shard, previousErrors);
        return attachment
          ? [
            attachment.mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: attachment.mediaType, data: attachment.data } }
              : { type: "image", source: { type: "base64", media_type: attachment.mediaType, data: attachment.data } },
            { type: "text", text: prompt },
          ]
          : prompt;
      };
      const providerScope = options.providerScope || (source.type === "url" ? "website" : "resume");
      const stepPrefix = options.stepPrefix || (providerScope === "website" ? "website" : "profile");
      const executeShard = async (shard: ExtractionShard, minimumItems: number) => {
        const step = `${stepPrefix}.${shard}`;
        tracer.emit({ type: "step.started", step, attempt });
        const result = await callProfileModel<Record<string, unknown>>({
          system: systemPrompt(source.format, shard),
          content: contentFor(shard),
          schema: shard === "identity" ? IDENTITY_DRAFT_SCHEMA : ITEMS_DRAFT_SCHEMA,
          shard,
          minimumItems,
          providerScope,
          providerOverride: options.providerConfig,
          tracer,
          attempt,
          promptVersion: PROFILE_PROMPT_VERSIONS[shard],
          step,
          runtimeControls,
        });
        tracer.emit({
          type: "artifact.created",
          step,
          name: shard === "identity" ? "identity-draft.json" : `${shard}-draft.json`,
          schemaVersion: "profile-draft.v1",
        });
        tracer.emit({ type: "step.completed", step });
        return result;
      };

      const identityOutputPromise = executeShard("identity", 0);
      const inventoryOutputPromises = inventoryShards.map((shard) => executeShard(
        shard,
        shard === "research"
          ? expectations.researchItems
          : shard === "career"
            ? expectations.careerItems
            : expectations.minimumItems,
      ));

      try {
        const identityResult = await identityOutputPromise;
        const identityDraft = identityResult.data;
        const preview = identityDraft as Partial<AgentProfileDraft>;
        const website = safeHttpUrl(preview.personalWebsite?.value);
        if (website) options.onPersonalWebsite?.(website);
        const itemResults = await Promise.all(inventoryOutputPromises);
        const itemsDrafts = itemResults.map((result) => result.data);
        const identity = identityDraft.identity as AgentProfileDraft["identity"] | undefined;
        const inventoryByKey = new Map<string, ReturnType<typeof inventoryItem>>();
        for (const itemsDraft of itemsDrafts) {
          if (!Array.isArray(itemsDraft.items)) continue;
          for (const rawItem of itemsDraft.items as Record<string, unknown>[]) {
            const item = inventoryItem(rawItem);
            const key = `${cleanString(item.kind).toLocaleLowerCase()}:${cleanString(item.title).toLocaleLowerCase()}`;
            if (!inventoryByKey.has(key)) inventoryByKey.set(key, item);
          }
        }
        const inventory = [...inventoryByKey.values()];
        const expandedItems = [
          ...(identity?.summary ? [{
            kind: "summary" as const,
            contentFamily: null,
            title: "个人简介",
            subtitle: null,
            summary: identity.summary.value,
            bullets: [],
            tags: [],
            mediaIndex: null,
            sourceUrl: null,
            timeRange: null,
            role: null,
            techStack: [],
            projectUrl: null,
            evidenceLines: identity.summary.evidenceLines,
            evidenceExcerpt: identity.summary.evidenceExcerpt,
          }] : []),
          ...inventory,
        ];
        const pageCounts = [identityDraft.sourcePageCount, ...itemsDrafts.map((draft) => draft.sourcePageCount)]
          .filter((value): value is number => Number.isInteger(value) && Number(value) > 0);
        const combinedDraft = {
          ...identityDraft,
          items: expandedItems,
          sourcePageCount: source.pageCount || (pageCounts.length ? Math.max(...pageCounts) : null),
        };
        const validationStep = `${stepPrefix}.validate`;
        tracer.emit({ type: "step.started", step: validationStep, attempt });
        const profile = normalizeProfileDraft(combinedDraft, normalized, source);
        tracer.emit({
          type: "artifact.created",
          step: validationStep,
          name: "profile.json",
          schemaVersion: "profile.v1",
        });
        tracer.emit({ type: "step.completed", step: validationStep });
        if (ownsTracer) tracer.complete();
        return { profile, run: tracer.snapshot()! };
      } catch (error) {
        await Promise.allSettled([identityOutputPromise, ...inventoryOutputPromises]);
        const details = error instanceof ProfileAgentError ? error.details : [];
        const validationStep = `${stepPrefix}.validate`;
        tracer.emit({
          type: "validation.failed",
          step: validationStep,
          errors: details.length ? details : [errorCode(error)],
        });
        if (!(error instanceof ProfileAgentError) || attemptIndex === MAX_AGENT_ATTEMPTS - 1) throw error;
        previousErrors = error.details;
        tracer.emit({
          type: "step.retried",
          step: validationStep,
          attempt: attempt + 1,
          reason: previousErrors[0] || "validation_failed",
        });
      }
    }
    throw new ProfileAgentError("Agent 解析失败。", 502);
  } catch (error) {
    if (error instanceof AgentBudgetExceededError) {
      tracer.emit({
        type: "budget.exhausted",
        step: options.stepPrefix || "profile",
        reason: error.reason,
        usage: runtimeControls.budget.snapshot(),
      });
    }
    if (ownsTracer) tracer.fail(errorCode(error));
    throw error;
  }
}

export async function extractProfileWithAgentRun(
  text: string,
  source: ProfileAgentSource = {},
  options: ProfileAgentOptions = {},
) {
  return runProfileAgent(text, { ...source, format: source.format || "text" }, undefined, options);
}

export async function extractProfileFromAttachmentWithAgentRun(
  attachment: AgentAttachment,
  source: ProfileAgentSource,
  preparsedText = "",
  options: ProfileAgentOptions = {},
) {
  return runProfileAgent(preparsedText, source, attachment, options);
}
