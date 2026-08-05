import { directWorld } from "../agents/creative-director.ts";
import {
  allowedReferenceReuse,
  retrieveCreativeReferences,
  shouldEnableVectorRetrieval,
  type CreativeRetrievalPurpose,
} from "../rag/creative-retrieval.ts";
import { referenceCatalog } from "../rag/reference-catalog.ts";
import type { ParsedProfile, ReferencePattern } from "../types.ts";

export type CreativeRetrievalEvalCase = {
  id: string;
  query: string;
  purpose: CreativeRetrievalPurpose;
  categories: ReferencePattern["category"][];
  relevant: Array<{ referenceId: string; relevance: number }>;
  forbiddenReferenceIds?: string[];
};

export type CreativeRetrievalDataset = {
  schemaVersion: "creative-retrieval-dataset.v1";
  id: string;
  reviewStatus: "prelabeled" | "human-verified";
  topK: number;
  thresholds: {
    recallAtK: number;
    precisionAtK: number;
    ndcg: number;
    licenseViolationRate: number;
    creativeBriefCitationRate: number;
  };
  cases: CreativeRetrievalEvalCase[];
};

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function dcg(relevances: number[]) {
  return relevances.reduce((total, relevance, index) => (
    total + (2 ** relevance - 1) / Math.log2(index + 2)
  ), 0);
}

function fixtureProfile(id: string, query: string): ParsedProfile {
  return {
    id: `creative-eval-${id}`,
    name: "Creative Retrieval Fixture",
    headline: query,
    summary: query,
    contacts: [],
    identityEvidence: {},
    contactEvidence: {},
    media: [],
    skills: [],
    skillEvidence: {},
    items: [],
    source: { id: `source-${id}`, type: "text", label: `${id}.txt`, lineCount: 1 },
  };
}

function creativeBriefCitationRate(cases: CreativeRetrievalEvalCase[]) {
  const catalog = new Map(referenceCatalog.map((reference) => [reference.id, reference]));
  let citations = 0;
  let valid = 0;
  for (const entry of cases) {
    const brief = directWorld(fixtureProfile(entry.id, entry.query));
    for (const citation of brief.references) {
      citations += 1;
      const source = catalog.get(citation.referenceId);
      if (
        source
        && source.reuse === "approved"
        && citation.name === source.name
        && citation.patterns.every((pattern) => source.patterns.includes(pattern))
      ) valid += 1;
    }
  }
  return citations ? valid / citations : 0;
}

export function evaluateCreativeRetrieval(dataset: CreativeRetrievalDataset) {
  if (dataset.schemaVersion !== "creative-retrieval-dataset.v1") {
    throw new Error("Unsupported Creative Retrieval Eval dataset version.");
  }
  if (!Number.isInteger(dataset.topK) || dataset.topK < 1 || dataset.topK > 10 || !dataset.cases.length) {
    throw new Error("Creative Retrieval Eval has an invalid Top K or no cases.");
  }
  const catalogIds = new Set(referenceCatalog.map((reference) => reference.id));
  const caseIds = new Set<string>();
  for (const entry of dataset.cases) {
    if (!entry.id || caseIds.has(entry.id) || !entry.query.trim() || !entry.categories.length) {
      throw new Error(`Invalid or duplicate Creative Retrieval Eval case: ${entry.id || "unknown"}.`);
    }
    caseIds.add(entry.id);
    for (const referenceId of [
      ...entry.relevant.map((reference) => reference.referenceId),
      ...(entry.forbiddenReferenceIds || []),
    ]) {
      if (!catalogIds.has(referenceId)) throw new Error(`${entry.id} references an unknown catalog item: ${referenceId}.`);
    }
  }
  const results = dataset.cases.map((entry) => {
    const retrieval = retrieveCreativeReferences({
      text: entry.query,
      purpose: entry.purpose,
      categories: entry.categories,
      limit: dataset.topK,
    });
    const relevant = new Map(entry.relevant.map((item) => [item.referenceId, item.relevance]));
    const ids = retrieval.references.map((reference) => reference.referenceId);
    const retrievedRelevant = ids.filter((id) => relevant.has(id)).length;
    const expectsEmpty = relevant.size === 0;
    const recallAtK = expectsEmpty ? (ids.length ? 0 : 1) : retrievedRelevant / relevant.size;
    const precisionAtK = expectsEmpty ? (ids.length ? 0 : 1) : retrievedRelevant / Math.max(1, ids.length);
    const actualDcg = dcg(ids.map((id) => relevant.get(id) || 0));
    const idealDcg = dcg([...relevant.values()].sort((left, right) => right - left).slice(0, dataset.topK));
    const ndcg = expectsEmpty ? (ids.length ? 0 : 1) : idealDcg ? actualDcg / idealDcg : 0;
    const allowedReuse = allowedReferenceReuse(entry.purpose);
    const forbiddenHits = ids.filter((id) => entry.forbiddenReferenceIds?.includes(id));
    const policyViolationIds = new Set([
      ...retrieval.references.filter((reference) => !allowedReuse.has(reference.reuse)).map((reference) => reference.referenceId),
      ...forbiddenHits,
    ]);
    return {
      id: entry.id,
      retrievedIds: ids,
      recallAtK: rounded(recallAtK),
      precisionAtK: rounded(precisionAtK),
      ndcg: rounded(ndcg),
      licenseViolations: policyViolationIds.size,
      forbiddenHits,
      audit: retrieval.audit,
    };
  });
  const selectedCount = results.reduce((total, result) => total + result.retrievedIds.length, 0);
  const violationCount = results.reduce((total, result) => total + result.licenseViolations, 0);
  const summary = {
    recallAtK: rounded(mean(results.map((result) => result.recallAtK))),
    precisionAtK: rounded(mean(results.map((result) => result.precisionAtK))),
    ndcg: rounded(mean(results.map((result) => result.ndcg))),
    licenseViolationRate: rounded(violationCount / Math.max(1, selectedCount)),
    creativeBriefCitationRate: rounded(creativeBriefCitationRate(dataset.cases)),
  };
  const passed = summary.recallAtK >= dataset.thresholds.recallAtK
    && summary.precisionAtK >= dataset.thresholds.precisionAtK
    && summary.ndcg >= dataset.thresholds.ndcg
    && summary.licenseViolationRate <= dataset.thresholds.licenseViolationRate
    && summary.creativeBriefCitationRate >= dataset.thresholds.creativeBriefCitationRate;
  return {
    schemaVersion: "creative-retrieval-eval-report.v1" as const,
    dataset: dataset.id,
    catalogSize: referenceCatalog.length,
    topK: dataset.topK,
    caseCount: dataset.cases.length,
    reviewStatus: dataset.reviewStatus,
    thresholds: dataset.thresholds,
    summary,
    vectorRetrievalRecommended: shouldEnableVectorRetrieval({
      catalogSize: referenceCatalog.length,
      lexicalRecallAtK: summary.recallAtK,
      minimumRecallAtK: dataset.thresholds.recallAtK,
    }),
    passed,
    results,
  };
}

export function creativeRetrievalReportMarkdown(report: ReturnType<typeof evaluateCreativeRetrieval>) {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const caseLabels: Record<string, string> = {
    "low-poly-room": "低多边形房间",
    "guided-personal-room": "引导式个人房间",
    "world-onboarding-recovery": "3D 世界新手引导与恢复",
    "accessible-react-fallback": "React 无障碍降级页",
    "computer-gallery-room": "电脑画廊房间",
    "bilingual-low-poly-room": "双语低多边形房间",
    "bilingual-world-recovery": "双语世界恢复引导",
    "cyberpunk-visual-inspiration": "赛博朋克视觉灵感",
    "space-career-inspiration": "太空职业叙事灵感",
    "quarantined-retro-implementation": "隔离状态复古实现素材",
  };
  return [
    `# Creative Retrieval 评测报告：${report.dataset}`,
    "",
    `- 评测结果：**${report.passed ? "通过" : "未通过"}**`,
    `- 素材库规模：${report.catalogSize} 条参考素材`,
    `- 测试用例：${report.caseCount} 个（${report.reviewStatus === "human-verified" ? "已人工复核" : "预标注"}）`,
    `- Top K：${report.topK}`,
    `- 是否建议引入向量检索：**${report.vectorRetrievalRecommended ? "是" : "否"}**`,
    "",
    "## 总体指标",
    "",
    "| 指标 | 结果 |",
    "| --- | ---: |",
    `| 召回率 Recall@K | ${percent(report.summary.recallAtK)} |`,
    `| 精确率 Precision@K | ${percent(report.summary.precisionAtK)} |`,
    `| 排序质量 nDCG | ${percent(report.summary.ndcg)} |`,
    `| 许可证策略违规率 | ${percent(report.summary.licenseViolationRate)} |`,
    `| Creative Brief 引用完整率 | ${percent(report.summary.creativeBriefCitationRate)} |`,
    "",
    "## 分用例结果",
    "",
    "| 用例 | 检索结果 | R@K | P@K | nDCG |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.results.map((result) => (
      `| ${caseLabels[result.id] || result.id}（\`${result.id}\`） | ${result.retrievedIds.join(", ") || "—"} | ${percent(result.recallAtK)} | ${percent(result.precisionAtK)} | ${percent(result.ndcg)} |`
    )),
    "",
  ].join("\n");
}
