export const EVIDENCE_LINES_SCHEMA = { type: "array", items: { type: "integer" } } as const;

export const DRAFT_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    evidenceLines: EVIDENCE_LINES_SCHEMA,
    evidenceExcerpt: { type: "string" },
  },
  required: ["value", "evidenceLines", "evidenceExcerpt"],
} as const;

export const IDENTITY_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourcePageCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
    personalWebsite: { anyOf: [DRAFT_VALUE_SCHEMA, { type: "null" }] },
    identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: DRAFT_VALUE_SCHEMA,
        headline: DRAFT_VALUE_SCHEMA,
        location: { anyOf: [DRAFT_VALUE_SCHEMA, { type: "null" }] },
        summary: DRAFT_VALUE_SCHEMA,
      },
      required: ["name", "headline", "location", "summary"],
    },
    contacts: { type: "array", items: DRAFT_VALUE_SCHEMA },
    foods: { type: "array", items: DRAFT_VALUE_SCHEMA },
    hobbies: { type: "array", items: DRAFT_VALUE_SCHEMA },
    skills: { type: "array", items: DRAFT_VALUE_SCHEMA },
  },
  required: ["sourcePageCount", "personalWebsite", "identity", "contacts", "foods", "hobbies", "skills"],
} as const;

export const INVENTORY_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { enum: ["project", "experience", "education", "achievement"] },
    contentFamily: {
      anyOf: [{ enum: ["publication", "open-source", "talk", "exhibition", "media-coverage"] }, { type: "null" }],
    },
    title: { type: "string" },
    subtitle: { anyOf: [{ type: "string" }, { type: "null" }] },
    detail: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    timeRange: { anyOf: [{ type: "string" }, { type: "null" }] },
    role: { anyOf: [{ type: "string" }, { type: "null" }] },
    techStack: { type: "array", items: { type: "string" } },
    projectUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    fieldEvidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        timeRange: EVIDENCE_LINES_SCHEMA,
        role: EVIDENCE_LINES_SCHEMA,
        techStack: EVIDENCE_LINES_SCHEMA,
        projectUrl: EVIDENCE_LINES_SCHEMA,
      },
    },
    sourceUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    mediaIndex: { anyOf: [{ type: "integer" }, { type: "null" }] },
    evidenceLines: EVIDENCE_LINES_SCHEMA,
    evidenceExcerpt: { type: "string" },
  },
  required: [
    "kind", "contentFamily", "title", "detail", "timeRange", "sourceUrl", "mediaIndex",
    "evidenceLines", "evidenceExcerpt",
  ],
} as const;

export const ITEMS_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourcePageCount: { anyOf: [{ type: "integer" }, { type: "null" }] },
    items: { type: "array", minItems: 1, items: INVENTORY_VALUE_SCHEMA },
  },
  required: ["sourcePageCount", "items"],
} as const;

export type ProfileDraftSchema = typeof IDENTITY_DRAFT_SCHEMA | typeof ITEMS_DRAFT_SCHEMA;
