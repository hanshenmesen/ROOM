import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { directWorld } from "../lib/agents/creative-director.ts";
import { evaluateCreativeRetrieval, type CreativeRetrievalDataset } from "../lib/evals/creative-retrieval.ts";
import {
  retrieveCreativeReferences,
  shouldEnableVectorRetrieval,
  VECTOR_RETRIEVAL_MIN_CATALOG_SIZE,
} from "../lib/rag/creative-retrieval.ts";
import { referenceCatalog } from "../lib/rag/reference-catalog.ts";
import type { ParsedProfile } from "../lib/types.ts";

const dataset = JSON.parse(readFileSync(
  new URL("../evals/creative-retrieval-cases.json", import.meta.url),
  "utf8",
)) as CreativeRetrievalDataset;

test("implementation retrieval applies metadata filtering before a strict License Guard", () => {
  const result = retrieveCreativeReferences({
    text: "retro computer operating system navigation hub",
    purpose: "implementation",
    categories: ["retro"],
  });
  assert.deepEqual(result.references, []);
  assert.deepEqual(result.audit.blockedByLicense, ["henry-heffernan"]);
});

test("visual-only references remain available for labeled inspiration, never implementation", () => {
  const result = retrieveCreativeReferences({
    text: "cyberpunk neon narrative shop",
    purpose: "inspiration",
    categories: ["visual"],
    limit: 1,
  });
  assert.equal(result.references[0]?.referenceId, "jesses-ramen");
  assert.equal(result.references[0]?.reuse, "visual-only");
});

test("bilingual lexical expansion changes the top reusable Creative Brief reference", () => {
  const profile: ParsedProfile = {
    id: "creative-profile",
    name: "林一",
    headline: "低多边形空间设计师",
    summary: "项目支持悬停与点击，并从单一总览镜头进入房间。",
    contacts: [],
    identityEvidence: {},
    contactEvidence: {},
    media: [],
    skills: ["Blender"],
    skillEvidence: {},
    items: [],
    source: { id: "source", type: "text", label: "creative.txt", lineCount: 2 },
  };
  const brief = directWorld(profile);
  assert.equal(brief.references[0]?.referenceId, "maxime-morel");
  const byId = new Map(referenceCatalog.map((reference) => [reference.id, reference]));
  assert.ok(brief.references.every((reference) => byId.get(reference.referenceId)?.reuse === "approved"));
});

test("Creative Retrieval Eval is deterministic and keeps vector retrieval disabled", () => {
  const report = evaluateCreativeRetrieval(dataset);
  assert.equal(report.passed, true);
  assert.deepEqual(report.summary, {
    recallAtK: 1,
    precisionAtK: 0.6,
    ndcg: 1,
    licenseViolationRate: 0,
    creativeBriefCitationRate: 1,
  });
  assert.equal(report.catalogSize, 13);
  assert.equal(report.vectorRetrievalRecommended, false);
  const committed = JSON.parse(readFileSync(
    new URL("../evals/reports/creative-retrieval-v1.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(committed, report);
});

test("the vector gate requires both catalog scale and measured lexical recall failure", () => {
  assert.equal(VECTOR_RETRIEVAL_MIN_CATALOG_SIZE, 200);
  assert.equal(shouldEnableVectorRetrieval({ catalogSize: 13, lexicalRecallAtK: 0.2 }), false);
  assert.equal(shouldEnableVectorRetrieval({ catalogSize: 500, lexicalRecallAtK: 0.95 }), false);
  assert.equal(shouldEnableVectorRetrieval({ catalogSize: 500, lexicalRecallAtK: 0.7 }), true);
});

test("Creative Retrieval Eval rejects unknown catalog labels", () => {
  const invalid = structuredClone(dataset);
  invalid.cases[0]!.relevant = [{ referenceId: "invented-reference", relevance: 3 }];
  assert.throws(() => evaluateCreativeRetrieval(invalid), /unknown catalog item/);
});
