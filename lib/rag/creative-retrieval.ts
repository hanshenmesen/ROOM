import type { ReferencePattern, RetrievedReference } from "../types.ts";
import { referenceCatalog, roomFirstReferenceIds } from "./reference-catalog.ts";

export const VECTOR_RETRIEVAL_MIN_CATALOG_SIZE = 200;

export type CreativeRetrievalPurpose = "implementation" | "inspiration";

export type CreativeRetrievalQuery = {
  text: string;
  purpose?: CreativeRetrievalPurpose;
  categories?: ReferencePattern["category"][];
  limit?: number;
};

export type CreativeRetrievalAudit = {
  catalogSize: number;
  metadataEligible: number;
  licenseEligible: number;
  blockedByLicense: string[];
  selected: number;
};

const QUERY_EXPANSIONS: Array<[string, string[]]> = [
  ["房间", ["room"]],
  ["空间", ["room", "world"]],
  ["项目", ["project", "portfolio"]],
  ["交互", ["interactive", "click", "hotspots"]],
  ["低多边形", ["low", "poly", "low-poly"]],
  ["悬停", ["hover"]],
  ["点击", ["click"]],
  ["总览", ["overview"]],
  ["游戏", ["game", "games"]],
  ["物理", ["physics"]],
  ["引导", ["guided", "onboarding"]],
  ["教学", ["onboarding", "controls"]],
  ["质量模式", ["quality"]],
  ["恢复", ["recovery"]],
  ["复古", ["retro"]],
  ["电脑", ["computer"]],
  ["导航", ["navigation"]],
  ["叙事", ["narrative"]],
  ["霓虹", ["neon"]],
  ["职业", ["career"]],
  ["任务", ["missions"]],
  ["地图", ["map"]],
];

const STOP_TOKENS = new Set([
  "a", "an", "and", "as", "at", "by", "every", "for", "from", "in", "instead", "into", "of", "on", "or", "the", "to", "use", "while", "with",
]);

function lexicalTokens(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const values = new Set<string>();
  for (const token of normalized.match(/[a-z0-9]+(?:-[a-z0-9]+)*|[\u3400-\u9fff]+/gu) || []) {
    if (/^[\u3400-\u9fff]+$/u.test(token)) {
      values.add(token);
      for (let index = 0; index < token.length - 1; index += 1) values.add(token.slice(index, index + 2));
    } else if (token.length > 1 && !STOP_TOKENS.has(token)) {
      values.add(token);
      for (const part of token.split("-")) if (part.length > 1 && !STOP_TOKENS.has(part)) values.add(part);
    }
  }
  for (const [phrase, expansions] of QUERY_EXPANSIONS) {
    if (normalized.includes(phrase)) expansions.forEach((token) => values.add(token));
  }
  return values;
}

export function allowedReferenceReuse(purpose: CreativeRetrievalPurpose) {
  return purpose === "implementation"
    ? new Set<ReferencePattern["reuse"]>(["approved"])
    : new Set<ReferencePattern["reuse"]>(["approved", "visual-only"]);
}

function rankedReference(reference: ReferencePattern, queryTokens: Set<string>): RetrievedReference {
  const tagTokens = lexicalTokens(reference.tags.join(" "));
  const patternTokens = lexicalTokens(reference.patterns.join(" "));
  const tagMatches = [...tagTokens].filter((token) => queryTokens.has(token));
  const patternMatches = [...patternTokens].filter((token) => queryTokens.has(token) && !tagTokens.has(token));
  const roomPrior = roomFirstReferenceIds.includes(reference.id) ? 1.5 : 0;
  const score = reference.similarity * 1.5 + roomPrior + tagMatches.length * 6 + patternMatches.length * 1.5;
  const evidence = [
    tagMatches.length ? `标签匹配 ${tagMatches.slice(0, 4).join(", ")}` : "元数据先验匹配",
    patternMatches.length ? `模式匹配 ${patternMatches.slice(0, 3).join(", ")}` : "",
    `许可 ${reference.license}`,
  ].filter(Boolean).join(" · ");
  return {
    referenceId: reference.id,
    name: reference.name,
    score: Number(score.toFixed(3)),
    reason: evidence,
    patterns: reference.patterns.slice(0, 2),
    reuse: reference.reuse,
  };
}

export function retrieveCreativeReferences(
  query: CreativeRetrievalQuery,
  catalog: ReferencePattern[] = referenceCatalog,
) {
  const purpose = query.purpose || "implementation";
  const allowedReuse = allowedReferenceReuse(purpose);
  const categories = query.categories?.length ? new Set(query.categories) : undefined;
  const metadataEligible = categories
    ? catalog.filter((reference) => categories.has(reference.category))
    : [...catalog];
  const blockedByLicense = metadataEligible
    .filter((reference) => !allowedReuse.has(reference.reuse))
    .map((reference) => reference.id)
    .sort();
  const licenseEligible = metadataEligible.filter((reference) => allowedReuse.has(reference.reuse));
  const queryTokens = lexicalTokens(query.text);
  const limit = Math.min(10, Math.max(1, Math.floor(query.limit || 5)));
  const references = licenseEligible
    .map((reference) => rankedReference(reference, queryTokens))
    .sort((left, right) => right.score - left.score || left.referenceId.localeCompare(right.referenceId))
    .slice(0, limit);
  const audit: CreativeRetrievalAudit = {
    catalogSize: catalog.length,
    metadataEligible: metadataEligible.length,
    licenseEligible: licenseEligible.length,
    blockedByLicense,
    selected: references.length,
  };
  return { references, audit };
}

export function shouldEnableVectorRetrieval(input: {
  catalogSize: number;
  lexicalRecallAtK: number;
  minimumRecallAtK?: number;
}) {
  return input.catalogSize >= VECTOR_RETRIEVAL_MIN_CATALOG_SIZE
    && input.lexicalRecallAtK < (input.minimumRecallAtK ?? 0.85);
}
