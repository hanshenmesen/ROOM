export type ContentFamily =
  | "publication"
  | "talk"
  | "exhibition"
  | "open-source"
  | "media-coverage";

export type SectionKind =
  | "summary"
  | "project"
  | "experience"
  | "education"
  | "achievement";

export type RoomKind =
  | "lobby"
  | "bedroom"
  | "experience"
  | "skills"
  | "achievements";

export type Vec3 = [number, number, number];

export interface SourceEvidence {
  sourceId: string;
  locator: string;
  excerpt: string;
  origin?: "source" | "system-generated";
}

export interface ProfileMedia {
  url: string;
  originalUrl: string;
  sourcePage: string;
  locator: string;
  alt?: string;
  title?: string;
  linkUrl?: string;
  kind: "project" | "profile" | "other";
  category:
    | "profile-photo"
    | "project-cover"
    | "logo"
    | "screenshot"
    | "content"
    | "decorative"
    | "other";
  categoryConfidence: number;
  categoryReason: string;
}

export interface MediaProvenance {
  originalUrl: string;
  sourcePage: string;
  locator: string;
  category:
    | "profile-photo"
    | "project-cover"
    | "logo"
    | "screenshot"
    | "content"
    | "decorative"
    | "other";
  categoryConfidence: number;
  categoryReason: string;
}

export type ProfileItemField = "timeRange" | "role" | "techStack" | "projectUrl";
export type FieldEvidence = Partial<Record<ProfileItemField, SourceEvidence[]>>;

export interface ProfileItem {
  id: string;
  kind: SectionKind;
  contentFamily?: ContentFamily;
  title: string;
  subtitle?: string;
  summary: string;
  bullets: string[];
  tags: string[];
  imageUrl?: string;
  sourceUrl?: string;
  timeRange?: string;
  role?: string;
  techStack?: string[];
  projectUrl?: string;
  fieldEvidence?: FieldEvidence;
  mediaProvenance?: MediaProvenance;
  evidence: SourceEvidence[];
}

export interface ParsedProfile {
  id: string;
  name: string;
  headline: string;
  location?: string;
  summary: string;
  contacts: string[];
  media: ProfileMedia[];
  identityEvidence: Partial<Record<"name" | "headline" | "location" | "summary", SourceEvidence[]>>;
  contactEvidence: Record<string, SourceEvidence[]>;
  skills: string[];
  skillEvidence: Record<string, SourceEvidence[]>;
  items: ProfileItem[];
  source: {
    id: string;
    type: "text" | "url";
    label: string;
    lineCount: number;
  };
}

export interface ReferencePattern {
  id: string;
  name: string;
  url?: string;
  category: "room" | "world" | "retro" | "template" | "visual";
  license: string;
  reuse: "approved" | "quarantined" | "research-only" | "visual-only";
  similarity: 1 | 2 | 3;
  tags: string[];
  patterns: string[];
}

export interface RetrievedReference {
  referenceId: string;
  name: string;
  score: number;
  reason: string;
  patterns: string[];
  reuse: ReferencePattern["reuse"];
}

export interface CreativeBrief {
  id: string;
  concept: string;
  narrative: string;
  spatialStrategy: string;
  mood: string[];
  palette: {
    background: string;
    floor: string;
    accent: string;
    highlight: string;
    rooms: Record<RoomKind, string>;
  };
  references: RetrievedReference[];
}

export interface PortalPlan {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  position: Vec3;
  label: string;
}

export interface RoomPlan {
  id: string;
  kind: RoomKind;
  title: string;
  subtitle: string;
  center: Vec3;
  size: Vec3;
  color: string;
  portalIds: string[];
  exhibitIds: string[];
}

export interface ExhibitPlan {
  id: string;
  sourceItemId: string;
  roomId: string;
  title: string;
  contentFamily?: ContentFamily;
  eyebrow: string;
  body: string;
  tags: string[];
  imageUrl?: string;
  sourceUrl?: string;
  timeRange?: string;
  role?: string;
  techStack?: string[];
  projectUrl?: string;
  fieldEvidence?: FieldEvidence;
  kind: "panel" | "pedestal" | "timeline" | "terminal" | "trophy";
  position: Vec3;
  size: Vec3;
  color: string;
  interaction: {
    clickable: boolean;
    hitbox: Vec3;
    action: "open-detail" | "open-link";
  };
  evidence: SourceEvidence[];
}

export interface DisplaySurfacePlan {
  id: string;
  roomId: string;
  semanticRole?: "profile" | "education" | "experience" | "skills" | "achievement" | "contact" | "works";
  title?: string;
  kicker?: string;
  accent?: string;
  sourceItemIds: string[];
  presentationMode: "single" | "summary" | "paged";
  pageSize?: number;
  layout?: {
    position: Vec3;
    rotation?: Vec3;
    width: number;
    height: number;
    variant: "text" | "profile" | "timeline" | "skills" | "project";
  };
  focusTarget: {
    target: Vec3;
    camera: Vec3;
    fov: number;
  };
  interaction: {
    clickable: boolean;
    action: "open-detail" | "open-link";
  };
}

export interface WorldMetrics {
  rooms: number;
  exhibits: number;
  estimatedDrawCalls: number;
  estimatedTriangles: number;
  realtimeLights: number;
}

export interface WorldPlan {
  version: "0.1.0";
  id: string;
  profile: ParsedProfile;
  brief: CreativeBrief;
  rooms: RoomPlan[];
  portals: PortalPlan[];
  exhibits: ExhibitPlan[];
  displaySurfaces: DisplaySurfacePlan[];
  tour: Array<{ roomId: string; label: string; camera: Vec3 }>;
  metrics: WorldMetrics;
}

export interface CheckIssue {
  id: string;
  category:
    | "content"
    | "overlap"
    | "interaction"
    | "performance"
    | "navigation";
  severity: "error" | "warning" | "info";
  message: string;
  entityIds: string[];
  suggestion: string;
}

export interface CheckReport {
  passed: boolean;
  score: number;
  summary: string;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  issues: CheckIssue[];
}

export interface AgentTrace {
  id: "parser" | "director" | "orchestrator" | "checker";
  name: string;
  status: "complete" | "warning" | "failed";
  summary: string;
  artifacts: string[];
}

export interface PipelineResult {
  profile: ParsedProfile;
  brief: CreativeBrief;
  world: WorldPlan;
  report: CheckReport;
  trace: AgentTrace[];
}
