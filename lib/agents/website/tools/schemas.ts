export const WEBSITE_TOOL_NAMES = [
  "fetch_page",
  "list_links",
  "inspect_page",
  "extract_media",
  "validate_claim",
  "submit_profile",
] as const;

export type WebsiteToolName = (typeof WEBSITE_TOOL_NAMES)[number];

const urlProperty = { type: "string", format: "uri", maxLength: 2_048 } as const;

export const WEBSITE_TOOL_SCHEMAS = {
  fetch_page: {
    input: { type: "object", additionalProperties: false, required: ["url", "depth"], properties: {
      url: urlProperty,
      depth: { type: "integer", minimum: 0, maximum: 2 },
    } },
    output: { type: "object", additionalProperties: false, required: ["url", "contentType", "byteLength"], properties: {
      url: urlProperty,
      contentType: { type: "string" },
      byteLength: { type: "integer", minimum: 0 },
    } },
  },
  list_links: {
    input: { type: "object", additionalProperties: false, required: ["pageUrl", "depth"], properties: {
      pageUrl: urlProperty,
      depth: { type: "integer", minimum: 0, maximum: 2 },
    } },
    output: { type: "array", maxItems: 100, items: { type: "object" } },
  },
  inspect_page: {
    input: { type: "object", additionalProperties: false, required: ["pageUrl", "depth"], properties: {
      pageUrl: urlProperty,
      depth: { type: "integer", minimum: 0, maximum: 2 },
    } },
    output: { type: "object", additionalProperties: false, required: ["title", "lineCount"], properties: {
      title: { type: "string" },
      lineCount: { type: "integer", minimum: 0 },
    } },
  },
  extract_media: {
    input: { type: "object", additionalProperties: false, required: ["pageUrl"], properties: { pageUrl: urlProperty } },
    output: { type: "array", maxItems: 80, items: { type: "object" } },
  },
  validate_claim: {
    input: { type: "object", additionalProperties: false, required: ["field", "pageUrl", "locator"], properties: {
      field: { type: "string", maxLength: 100 },
      pageUrl: urlProperty,
      locator: { type: "string", maxLength: 100 },
    } },
    output: { type: "object", additionalProperties: false, required: ["supported"], properties: {
      supported: { type: "boolean" },
    } },
  },
  submit_profile: {
    input: { type: "object", additionalProperties: false, required: ["pageCount", "characterCount"], properties: {
      pageCount: { type: "integer", minimum: 1, maximum: 5 },
      characterCount: { type: "integer", minimum: 1 },
    } },
    output: { type: "object", additionalProperties: false, required: ["profileId", "itemCount"], properties: {
      profileId: { type: "string" },
      itemCount: { type: "integer", minimum: 0 },
    } },
  },
} as const;
