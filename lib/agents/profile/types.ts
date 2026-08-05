import type { AgentTracer } from "../../agent-runtime/tracer.ts";
import type { ContentFamily, ProfileItem, ProfileMedia } from "../../types.ts";
import type { AgentProviderOverride } from "../provider-config.ts";

export type DraftValue = {
  value: string;
  evidenceLines: number[];
  evidenceExcerpt?: string;
};

export type AgentProfileDraft = {
  sourcePageCount?: number | null;
  personalWebsite: DraftValue | null;
  identity: {
    name: DraftValue;
    headline: DraftValue;
    location: DraftValue | null;
    summary: DraftValue;
  };
  contacts: DraftValue[];
  foods: DraftValue[];
  hobbies: DraftValue[];
  skills: DraftValue[];
  items: Array<{
    kind: ProfileItem["kind"];
    contentFamily: ContentFamily | null;
    title: string;
    subtitle: string | null;
    summary: string;
    bullets: string[];
    tags: string[];
    mediaIndex: number | null;
    sourceUrl: string | null;
    timeRange: string | null;
    role: string | null;
    techStack: string[];
    projectUrl: string | null;
    evidenceLines: number[];
    evidenceExcerpt?: string;
    fieldEvidence?: {
      timeRange: number[];
      role: number[];
      techStack: number[];
      projectUrl: number[];
    };
  }>;
};

export type ProfileAgentSource = {
  id?: string;
  type?: "text" | "url";
  label?: string;
  media?: ProfileMedia[];
  format?: "text" | "pdf" | "image";
  pageCount?: number;
};

export type ProfileAgentOptions = {
  onPersonalWebsite?: (website: string) => void;
  providerScope?: "resume" | "website";
  providerConfig?: AgentProviderOverride;
  tracer?: AgentTracer;
  runId?: string;
  stepPrefix?: "profile" | "website";
};

export type AgentAttachment = {
  mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
};

export type ExtractionShard = "identity" | "items" | "research" | "career";

export type MaasContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: Exclude<AgentAttachment["mediaType"], "application/pdf">; data: string } };

export class ProfileAgentError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(message: string, status = 502, details: string[] = []) {
    super(message);
    this.name = "ProfileAgentError";
    this.status = status;
    this.details = details;
  }
}
