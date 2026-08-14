import { wrapArtifact } from "../agent-runtime/artifact-envelope.ts";
import { createRoomRunContext, type RoomRunContext } from "../agent-runtime/run-context.ts";
import { extractProfileFromAttachmentWithAgentRun, extractProfileWithAgentRun } from "../agents/profile-agent.ts";
import {
  assembleProfileCheckpoints,
  extractProfileIdentityCheckpoint,
  extractProfileInventoryCheckpoint,
} from "../agents/profile/workflow-shards.ts";
import { getAgentProviderConfig } from "../agents/provider-config.ts";
import { providerCapabilitiesFor } from "../agents/provider-capabilities.ts";
import { mergeProfilesWithReport } from "../profile-merge.ts";
import { createWebsiteResearchModelPlanner } from "../agents/website/planner.ts";
import { runWebsiteResearchAgent } from "../agents/website/agent.ts";
import { preparsePdf } from "../pdf-preparse.ts";
import { defaultRoomWorkflowHandlers, WorkflowNodeError } from "./room-workflow.ts";
import type { WorkflowNodeContext, WorkflowNodeHandlers } from "./types.ts";

/** Resolves this node's `RoomRunContext`, creating a bare one when a caller ran the deterministic engine without `execution`. */
function runContextFor(context: WorkflowNodeContext): RoomRunContext {
  return context.execution?.context || createRoomRunContext({ runId: context.runId });
}

function isAgentRun(context: WorkflowNodeContext) {
  return context.input.mode === "agent";
}

function base64ToBytes(encoded: string) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Resolves plain text usable by the identity/inventory shard checkpoints.
 * Returns `undefined` when the source can only be handled as a multimodal
 * attachment (an image, or a PDF whose provider must see the rendered
 * pages) -- callers then fall back to a single un-sharded attachment call.
 */
function resolvePreparedText(context: WorkflowNodeContext): string | undefined {
  if (context.input.type === "text") return context.input.text;
  if (context.input.type === "pdf") {
    const prepared = context.state.artifacts.preparedSource?.data;
    if (!prepared) throw new WorkflowNodeError("missing_prepared_source", "Prepared Source checkpoint is missing.");
    return prepared.mode === "text" ? prepared.text : undefined;
  }
  return undefined;
}

export const agentRoomWorkflowHandlers: WorkflowNodeHandlers = {
  ...defaultRoomWorkflowHandlers,

  async prepare_source(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.prepare_source(context);
    if (context.input.type !== "pdf" && context.input.type !== "image") return;
    const attachment = context.input.attachment;
    if (!attachment) throw new WorkflowNodeError("missing_attachment", "此 Run 的来源缺少文件附件。");
    const maasSlot = getAgentProviderConfig(runContextFor(context).providerConfig).maas;
    const capabilities = providerCapabilitiesFor(maasSlot.baseUrl, maasSlot.model, maasSlot.protocol);
    if (context.input.type === "pdf") {
      const preparsed = await preparsePdf(base64ToBytes(attachment.data)).catch(() => null);
      // Mirrors /api/parse's provider boundary: providers without
      // document-block support get ROOM's local PDF text extraction as a
      // checkpointed artifact instead of an unsupported attachment.
      if (!capabilities.supportsDocumentBlocks) {
        if (!preparsed?.text.trim()) {
          throw new WorkflowNodeError(
            "pdf_text_unavailable",
            "该 PDF 无法提取文本，当前 Provider 不支持直接读取 PDF 文件。请上传可复制文字的 PDF，或改用支持 PDF 的多模态 Provider。",
          );
        }
        return { preparedSource: wrapArtifact("prepared-source", { mode: "text", text: preparsed.text, pageCount: preparsed.pageCount }) };
      }
      return {
        preparedSource: wrapArtifact("prepared-source", {
          mode: "attachment",
          attachment,
          preparsedText: preparsed?.text || "",
          pageCount: preparsed?.pageCount,
        }),
      };
    }
    if (!capabilities.supportsImageBlocks) {
      throw new WorkflowNodeError("image_unsupported", "当前 Provider 不支持图片输入。请改用支持图片的多模态 Provider（如 MAAS Claude 路由），或上传文本简历。");
    }
    return { preparedSource: wrapArtifact("prepared-source", { mode: "attachment", attachment, preparsedText: "" }) };
  },

  async extract_identity(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.extract_identity(context);
    if (context.input.type === "url") return;
    const preparedText = resolvePreparedText(context);
    if (preparedText === undefined) return; // Attachment mode: no identity/inventory sharding.
    const runContext = runContextFor(context);
    const checkpoint = await extractProfileIdentityCheckpoint(preparedText, {
      type: "text",
      label: context.input.label,
      format: "text",
    }, {
      providerConfig: runContext.providerConfig,
      tracer: runContext.tracer,
      runtimeControls: runContext.controls,
      signal: runContext.signal,
      attempt: context.attempt,
    });
    return { identityDraft: wrapArtifact("profile-identity", checkpoint) };
  },

  async extract_inventory(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.extract_inventory(context);
    if (context.input.type === "url") return;
    const preparedText = resolvePreparedText(context);
    const runContext = runContextFor(context);
    if (preparedText === undefined) {
      // Attachment mode (image, or a PDF the provider must see rendered):
      // one un-sharded multimodal call. `prepare_source` already
      // checkpointed the file read/local extraction, so a retry here never
      // re-uploads or re-parses the original file.
      const prepared = context.state.artifacts.preparedSource?.data;
      if (!prepared || prepared.mode !== "attachment") {
        throw new WorkflowNodeError("missing_prepared_source", "Prepared Source checkpoint is missing its attachment.");
      }
      const result = await extractProfileFromAttachmentWithAgentRun(prepared.attachment, {
        type: "text",
        label: context.input.label,
        format: context.input.type === "pdf" ? "pdf" : "image",
        pageCount: prepared.pageCount,
      }, prepared.preparsedText, {
        providerScope: "resume",
        stepPrefix: "profile",
        providerConfig: runContext.providerConfig,
        tracer: runContext.tracer,
        runtimeControls: runContext.controls,
        signal: runContext.signal,
      });
      return { resumeProfile: wrapArtifact("resume-profile", result.profile) };
    }
    const identity = context.state.artifacts.identityDraft?.data;
    if (!identity) throw new WorkflowNodeError("missing_identity_checkpoint", "Identity checkpoint is missing.");
    const inventory = await extractProfileInventoryCheckpoint(preparedText, {
      type: "text",
      label: context.input.label,
      format: "text",
    }, identity, {
      providerConfig: runContext.providerConfig,
      tracer: runContext.tracer,
      runtimeControls: runContext.controls,
      signal: runContext.signal,
      attempt: context.attempt,
    });
    const profile = assembleProfileCheckpoints(preparedText, {
      type: "text",
      label: context.input.label,
      format: "text",
    }, identity, inventory, runContext.tracer);
    return {
      inventoryDraft: wrapArtifact("profile-inventory", inventory),
      resumeProfile: wrapArtifact("resume-profile", profile),
    };
  },

  async research_website(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.research_website(context);
    const resumeProfile = context.state.artifacts.resumeProfile?.data;
    const rootUrl = context.input.type === "url"
      ? context.input.text
      : context.input.website
        ? context.input.website
        : context.input.followWebsite === false
          ? undefined
          : resumeProfile?.personalWebsite;
    if (!rootUrl) return;
    const runContext = runContextFor(context);
    const result = await runWebsiteResearchAgent({
      rootUrl,
      currentProfile: resumeProfile,
      tracer: runContext.tracer,
      signal: runContext.signal,
      planner: createWebsiteResearchModelPlanner({
        providerConfig: runContext.providerConfig,
        tracer: runContext.tracer,
        signal: runContext.signal,
        runtimeControls: runContext.controls,
      }),
      submitter: async ({ text, label, sourceId, media }) => (await extractProfileWithAgentRun(text, {
        id: sourceId,
        type: "url",
        label,
        media,
        format: "text",
      }, {
        providerScope: "website",
        providerConfig: runContext.providerConfig,
        tracer: runContext.tracer,
        stepPrefix: "website",
        signal: runContext.signal,
        runtimeControls: runContext.controls,
      })).profile,
    });
    return { websiteResearch: wrapArtifact("website-research", { profile: result.profile, state: result.state }) };
  },

  async merge_profile(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.merge_profile(context);
    const resumeProfile = context.state.artifacts.resumeProfile?.data;
    const website = context.state.artifacts.websiteResearch?.data;
    if (context.input.type === "url") {
      if (!website) throw new WorkflowNodeError("missing_website_checkpoint", "Website Research checkpoint is missing.");
      return { profile: wrapArtifact("profile", website.profile) };
    }
    if (!resumeProfile) throw new WorkflowNodeError("missing_resume_profile", "Resume Profile checkpoint is missing.");
    if (!website) return { profile: wrapArtifact("profile", resumeProfile) };
    const report = mergeProfilesWithReport(resumeProfile, website.profile, `${context.input.label} + ${website.state.rootUrl}`);
    return {
      profile: wrapArtifact("profile", report.merged),
      mergeReport: wrapArtifact("profile-merge-report", report),
    };
  },

  review_profile(context) {
    if (!isAgentRun(context)) return defaultRoomWorkflowHandlers.review_profile(context);
    const report = context.state.artifacts.mergeReport?.data;
    if (!report?.reviewRequired) return;
    return { review: { type: "profile_conflict", report } };
  },
};
