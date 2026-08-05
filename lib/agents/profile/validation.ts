import type { ExtractionShard } from "./types.ts";
import { cleanString } from "./utils.ts";

const ITEM_KINDS = new Set(["summary", "project", "experience", "education", "achievement"]);

export function shardOutputErrors(value: unknown, shard: ExtractionShard, minimumItems = 0) {
  if (!value || typeof value !== "object") return [`${shard} output must be a JSON object`];
  const draft = value as Record<string, unknown>;
  const identityErrors = () => {
    const identity = draft.identity && typeof draft.identity === "object"
      ? draft.identity as Record<string, unknown>
      : undefined;
    const valueOf = (field: unknown) => field && typeof field === "object"
      ? cleanString((field as Record<string, unknown>).value)
      : "";
    return [
      !identity ? "identity object is missing" : "",
      !valueOf(identity?.name) ? "identity.name.value is missing" : "",
      !valueOf(identity?.headline) ? "identity.headline.value is missing" : "",
      !valueOf(identity?.summary) ? "identity.summary.value is missing" : "",
      !Array.isArray(draft.contacts) ? "contacts array is missing" : "",
      !Array.isArray(draft.foods) ? "foods array is missing" : "",
      !Array.isArray(draft.hobbies) ? "hobbies array is missing" : "",
      !Array.isArray(draft.skills) ? "skills array is missing" : "",
    ].filter(Boolean);
  };
  if (shard === "identity") return identityErrors();
  if (!Array.isArray(draft.items)) return [`${shard}.items array is missing`];
  const items = draft.items as Array<Record<string, unknown>>;
  const errors = [
    items.length < minimumItems
      ? `${shard} shard must return at least ${minimumItems} items, received ${items.length}`
      : "",
  ];
  items.forEach((item, index) => {
    if (typeof item.kind !== "string" || !ITEM_KINDS.has(item.kind)) {
      errors.push(`${shard}.items[${index}].kind is invalid`);
    }
    if (!cleanString(item.title)) errors.push(`${shard}.items[${index}].title is missing`);
    if (!cleanString(item.detail)) errors.push(`${shard}.items[${index}].detail is missing`);
    if (!Array.isArray(item.evidenceLines) || !item.evidenceLines.length) {
      errors.push(`${shard}.items[${index}].evidenceLines is missing`);
    }
  });
  return errors.filter(Boolean).slice(0, 12);
}
