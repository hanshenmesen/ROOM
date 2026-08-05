import {
  extractProfileFromAttachmentWithAgentRun,
  extractProfileWithAgentRun,
} from "./profile/run-profile-agent.ts";
import type {
  AgentAttachment,
  ProfileAgentOptions,
  ProfileAgentSource,
} from "./profile/types.ts";

export {
  extractProfileFromAttachmentWithAgentRun,
  extractProfileWithAgentRun,
} from "./profile/run-profile-agent.ts";
export {
  ProfileAgentError,
} from "./profile/types.ts";
export type {
  AgentAttachment,
  ProfileAgentOptions,
  ProfileAgentSource,
} from "./profile/types.ts";

// Compatibility adapters keep all existing call sites returning ParsedProfile
// while run-aware consumers can opt into the richer *WithAgentRun functions.
export async function extractProfileWithAgent(
  text: string,
  source: ProfileAgentSource = {},
  options: ProfileAgentOptions = {},
) {
  return (await extractProfileWithAgentRun(text, source, options)).profile;
}

export async function extractProfileFromAttachmentWithAgent(
  attachment: AgentAttachment,
  source: ProfileAgentSource,
  preparsedText = "",
  options: ProfileAgentOptions = {},
) {
  return (await extractProfileFromAttachmentWithAgentRun(attachment, source, preparsedText, options)).profile;
}
