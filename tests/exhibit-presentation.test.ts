import assert from "node:assert/strict";
import test from "node:test";
import { materialFrameCopy } from "../lib/exhibit-presentation.ts";

test("publication frames use concise editorial copy without mutating the complete material", () => {
  const publication = {
    title: "Debate-to-Detect: Reformulating Misinformation Detection as a Real-World Debate with Large Language Models",
    body: "Reformulated misinformation detection as a multi-agent debate task simulating real-world fact-checking to enhance reasoning interpretability and transparency, outperforming existing baselines on two mainstream fake news datasets; published at EMNLP 2025, authored with Wenzhen Zheng and Xijin Tang.",
    contentFamily: "publication" as const,
    evidence: [{
      sourceId: "cv",
      locator: "page:1",
      excerpt: "Debate-to-Detect. EMNLP 2025 (CCF-B). 独立一作.",
      origin: "source" as const,
    }],
  };
  const original = structuredClone(publication);

  const copy = materialFrameCopy(publication, 1);

  assert.equal(copy.marker, "论文 01");
  assert.equal(copy.title, "Debate-to-Detect");
  assert.match(copy.meta, /EMNLP 2025/);
  assert.equal(copy.takeaway.length < publication.body.length, true);
  assert.equal(copy.takeaway.includes("published at"), false);
  assert.deepEqual(publication, original);
});

test("publication frames remove authorship and venue prefixes from the takeaway", () => {
  const copy = materialFrameCopy({
    title: "Constructing Knowledge Graphs from Document-Level Policy Texts With Lightweight LLMs",
    summary: "独立一作，CIKM 2025(CCF-B)论文，本地部署DeepSeek-R1-7B并LoRA微调完成文档级信息抽取，构建首个政府招商引资知识图谱及Graph-RAG智能问答应用。",
    contentFamily: "publication",
    evidence: [{ sourceId: "cv", locator: "page:1", excerpt: "CIKM 2025 (CCF-B)" }],
  }, 3);

  assert.equal(copy.marker, "论文 03");
  assert.match(copy.meta, /CIKM 2025/);
  assert.match(copy.takeaway, /^本地部署/);
  assert.equal(copy.takeaway.includes("独立一作"), false);
});

test("non-publication material keeps its category while limiting frame copy", () => {
  const body = "Built a browser-based spatial portfolio platform with a long implementation narrative that remains available in the selected exhibit detail and local editor.";
  const copy = materialFrameCopy({
    title: "ROOM: A Spatial Portfolio With Agent-Based Résumé Parsing and Editable Exhibits",
    body,
    contentFamily: "open-source",
    timeRange: "2026",
  }, 8);

  assert.equal(copy.marker, "开源 08");
  assert.equal(copy.meta, "2026");
  assert.equal(copy.title.length < 80, true);
  assert.equal(copy.takeaway.length < body.length, true);
});
