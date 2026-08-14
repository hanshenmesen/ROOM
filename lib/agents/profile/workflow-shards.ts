import { AgentRunControls } from "../../agent-runtime/run-controls.ts";
import type { AgentTracer } from "../../agent-runtime/tracer.ts";
import type { ParsedProfile } from "../../types.ts";
import type { AgentProviderOverride } from "../provider-config.ts";
import { quarantineSourceInstructions } from "../source-security.ts";
import { normalizeProfileDraft } from "./normalize.ts";
import { PROFILE_PROMPT_VERSIONS, systemPrompt, userPrompt } from "./prompts.ts";
import { callProfileModel } from "./provider.ts";
import { IDENTITY_DRAFT_SCHEMA, ITEMS_DRAFT_SCHEMA } from "./schemas.ts";
import { inventoryExpectations, planInventoryShards, type InventoryExpectations } from "./shard-planner.ts";
import type { AgentProfileDraft, ExtractionShard, ProfileAgentSource } from "./types.ts";

export type ProfileIdentityCheckpoint = {
  draft: Record<string, unknown>;
  expectations: InventoryExpectations;
  inventoryShards: ExtractionShard[];
};

export type ProfileInventoryCheckpoint = {
  drafts: Array<{ shard: ExtractionShard; draft: Record<string, unknown> }>;
};

export type ProfileWorkflowShardOptions = {
  providerConfig?: AgentProviderOverride;
  tracer: AgentTracer;
  runtimeControls?: AgentRunControls;
  signal?: AbortSignal;
  attempt?: number;
};

function preparedText(text: string, tracer: AgentTracer) {
  const prepared = quarantineSourceInstructions(text);
  if (prepared.findings.length) {
    tracer.emit({
      type: "security.input_quarantined",
      step: "profile",
      count: prepared.findings.length,
      categories: [...new Set(prepared.findings.map((finding) => finding.category))],
    });
  }
  return prepared.text;
}

export async function extractProfileIdentityCheckpoint(
  text: string,
  source: ProfileAgentSource,
  options: ProfileWorkflowShardOptions,
): Promise<ProfileIdentityCheckpoint> {
  const normalized = preparedText(text, options.tracer);
  const expectations = inventoryExpectations(normalized);
  const inventoryShards = planInventoryShards(expectations);
  const step = "profile.identity";
  const attempt = options.attempt || 1;
  const controls = options.runtimeControls || new AgentRunControls({ signal: options.signal });
  options.tracer.emit({ type: "step.started", step, attempt });
  const result = await callProfileModel<Record<string, unknown>>({
    system: systemPrompt("text", "identity"),
    content: userPrompt(normalized, { ...source, format: "text" }, "identity"),
    schema: IDENTITY_DRAFT_SCHEMA,
    shard: "identity",
    minimumItems: 0,
    providerScope: "resume",
    providerOverride: options.providerConfig,
    tracer: options.tracer,
    attempt,
    promptVersion: PROFILE_PROMPT_VERSIONS.identity,
    step,
    runtimeControls: controls,
  });
  options.tracer.emit({ type: "artifact.created", step, name: "identity-draft.json", schemaVersion: "profile-identity.v1" });
  options.tracer.emit({ type: "step.completed", step });
  return { draft: result.data, expectations, inventoryShards };
}

export async function extractProfileInventoryCheckpoint(
  text: string,
  source: ProfileAgentSource,
  identity: ProfileIdentityCheckpoint,
  options: ProfileWorkflowShardOptions,
): Promise<ProfileInventoryCheckpoint> {
  const normalized = quarantineSourceInstructions(text).text;
  const attempt = options.attempt || 1;
  const controls = options.runtimeControls || new AgentRunControls({ signal: options.signal });
  const settledDrafts = await Promise.allSettled(identity.inventoryShards.map(async (shard) => {
    const step = `profile.${shard}`;
    const minimumItems = shard === "research"
      ? identity.expectations.researchItems
      : shard === "career"
        ? identity.expectations.careerItems
        : identity.expectations.minimumItems;
    options.tracer.emit({ type: "step.started", step, attempt });
    const result = await callProfileModel<Record<string, unknown>>({
      system: systemPrompt("text", shard),
      content: userPrompt(normalized, { ...source, format: "text" }, shard),
      schema: ITEMS_DRAFT_SCHEMA,
      shard,
      minimumItems,
      providerScope: "resume",
      providerOverride: options.providerConfig,
      tracer: options.tracer,
      attempt,
      promptVersion: PROFILE_PROMPT_VERSIONS[shard],
      step,
      runtimeControls: controls,
    });
    options.tracer.emit({ type: "artifact.created", step, name: `${shard}-draft.json`, schemaVersion: "profile-inventory.v1" });
    options.tracer.emit({ type: "step.completed", step });
    return { shard, draft: result.data };
  }));
  const failed = settledDrafts.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
  const drafts = settledDrafts.map((result) => (result as PromiseFulfilledResult<{
    shard: ExtractionShard;
    draft: Record<string, unknown>;
  }>).value);
  return { drafts };
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
    ...(item.fieldEvidence && typeof item.fieldEvidence === "object" ? { fieldEvidence: item.fieldEvidence } : {}),
  };
}

export function assembleProfileCheckpoints(
  text: string,
  source: ProfileAgentSource,
  identityCheckpoint: ProfileIdentityCheckpoint,
  inventoryCheckpoint: ProfileInventoryCheckpoint,
  tracer?: AgentTracer,
): ParsedProfile {
  const normalized = quarantineSourceInstructions(text).text;
  const identityDraft = identityCheckpoint.draft;
  const identity = identityDraft.identity as AgentProfileDraft["identity"] | undefined;
  const inventoryByKey = new Map<string, ReturnType<typeof inventoryItem>>();
  for (const { draft } of inventoryCheckpoint.drafts) {
    if (!Array.isArray(draft.items)) continue;
    for (const raw of draft.items as Record<string, unknown>[]) {
      const item = inventoryItem(raw);
      const key = `${String(item.kind).toLocaleLowerCase()}:${String(item.title).trim().toLocaleLowerCase()}`;
      if (!inventoryByKey.has(key)) inventoryByKey.set(key, item);
    }
  }
  const itemDrafts = inventoryCheckpoint.drafts.map(({ draft }) => draft);
  const pageCounts = [identityDraft.sourcePageCount, ...itemDrafts.map((draft) => draft.sourcePageCount)]
    .filter((value): value is number => Number.isInteger(value) && Number(value) > 0);
  const combined = {
    ...identityDraft,
    items: [
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
      ...inventoryByKey.values(),
    ],
    sourcePageCount: source.pageCount || (pageCounts.length ? Math.max(...pageCounts) : null),
  };
  return normalizeProfileDraft(combined, normalized, { ...source, format: "text" }, {
    tracer,
    step: "profile.validate",
  });
}
