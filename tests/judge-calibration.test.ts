import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrateJudge,
  DEFAULT_JUDGE_CALIBRATION_THRESHOLDS,
  weightedKappa,
} from "../lib/evals/judge-calibration.ts";

test("weighted kappa equals 1 for perfect agreement", () => {
  const pairs = [
    { human: 1, judge: 1 },
    { human: 2, judge: 2 },
    { human: 3, judge: 3 },
    { human: 4, judge: 4 },
    { human: 5, judge: 5 },
    { human: 3, judge: 3 },
  ];
  assert.equal(weightedKappa(pairs, [1, 5]), 1);
});

test("weighted kappa is 0 when adjacent confusion matches chance margins", () => {
  // Hand-derived: human=[1,1,2,2], judge=[1,2,1,2] gives identical observed
  // and expected weighted disagreement (2/16 each), so kappa = 0.
  const pairs = [
    { human: 1, judge: 1 },
    { human: 1, judge: 2 },
    { human: 2, judge: 1 },
    { human: 2, judge: 2 },
  ];
  assert.equal(weightedKappa(pairs, [1, 5]), 0);
});

test("weighted kappa is strongly negative for complete reversal on a five-point scale", () => {
  // Hand-derived: human=[1,2,3,4,5] vs judge=[5,4,3,2,1] gives observed
  // disagreement 2.5 (1 + 4/16 + 0 + 4/16 + 1) and expected 1.25
  // (100/16 * 1/5), so kappa = 1 - 2.5/1.25 = -1.
  const pairs = [
    { human: 1, judge: 5 },
    { human: 2, judge: 4 },
    { human: 3, judge: 3 },
    { human: 4, judge: 2 },
    { human: 5, judge: 1 },
  ];
  assert.equal(weightedKappa(pairs, [1, 5]), -1);
});

test("weighted kappa is undefined for degenerate margins or empty input", () => {
  assert.equal(weightedKappa([], [1, 5]), undefined);
  assert.equal(weightedKappa([{ human: 3, judge: 3 }, { human: 3, judge: 3 }], [1, 5]), undefined);
  assert.equal(weightedKappa([{ human: 1, judge: 1 }], [1, 1]), undefined);
});

test("calibrateJudge reports agreement, error, and gate per dimension", () => {
  const report = calibrateJudge({
    dimensions: [
      { id: "narrative", label: "叙事", scale: [1, 5] },
      { id: "fidelity", label: "忠实度", scale: [1, 5] },
    ],
    samples: [
      { sampleId: "s1", humanScores: { narrative: 4, fidelity: 5 }, judgeScores: { narrative: 4, fidelity: 5 } },
      { sampleId: "s2", humanScores: { narrative: 3, fidelity: 5 }, judgeScores: { narrative: 4, fidelity: 4 } },
      { sampleId: "s3", humanScores: { narrative: 2, fidelity: 5 }, judgeScores: { narrative: 2, fidelity: 4 } },
    ],
    thresholds: { minWeightedKappa: 0.1, minWithinOneAgreement: 0.5 },
    generatedAt: "2026-08-05T00:00:00.000Z",
  });

  assert.equal(report.schemaVersion, "judge-calibration-report.v1");
  assert.equal(report.sampleCount, 3);
  const narrative = report.dimensions.find((dimension) => dimension.dimensionId === "narrative")!;
  assert.equal(narrative.sampleCount, 3);
  assert.equal(narrative.exactAgreement, 0.6667);
  assert.equal(narrative.withinOneAgreement, 1);
  assert.equal(narrative.meanAbsoluteError, 0.3333);
  assert.ok(narrative.weightedKappa !== undefined);

  const fidelity = report.dimensions.find((dimension) => dimension.dimensionId === "fidelity")!;
  assert.equal(fidelity.withinOneAgreement, 1);
  assert.equal(fidelity.meanAbsoluteError, 0.6667);
});

test("calibration gate fails when kappa or within-one agreement is below threshold", () => {
  const weak = calibrateJudge({
    dimensions: [{ id: "narrative", label: "叙事", scale: [1, 5] }],
    samples: [
      { sampleId: "s1", humanScores: { narrative: 1 }, judgeScores: { narrative: 5 } },
      { sampleId: "s2", humanScores: { narrative: 5 }, judgeScores: { narrative: 1 } },
      { sampleId: "s3", humanScores: { narrative: 2 }, judgeScores: { narrative: 4 } },
    ],
  });
  assert.equal(weak.dimensions[0].passed, false);
  assert.equal(weak.overall.passed, false);

  const strong = calibrateJudge({
    dimensions: [{ id: "narrative", label: "叙事", scale: [1, 5] }],
    samples: [
      { sampleId: "s1", humanScores: { narrative: 1 }, judgeScores: { narrative: 1 } },
      { sampleId: "s2", humanScores: { narrative: 5 }, judgeScores: { narrative: 5 } },
      { sampleId: "s3", humanScores: { narrative: 3 }, judgeScores: { narrative: 3 } },
    ],
  });
  assert.equal(strong.dimensions[0].weightedKappa, 1);
  assert.equal(strong.dimensions[0].passed, true);
  assert.equal(strong.overall.passed, true);
  assert.ok(strong.thresholds.minWeightedKappa === DEFAULT_JUDGE_CALIBRATION_THRESHOLDS.minWeightedKappa);
});

test("out-of-scale scores fail explicitly instead of skewing metrics", () => {
  assert.throws(
    () => calibrateJudge({
      dimensions: [{ id: "narrative", label: "叙事", scale: [1, 5] }],
      samples: [{ sampleId: "s1", humanScores: { narrative: 6 }, judgeScores: { narrative: 4 } }],
    }),
    /outside the narrative scale/,
  );
});

test("dimensions without paired samples cannot pass calibration", () => {
  const report = calibrateJudge({
    dimensions: [{ id: "narrative", label: "叙事", scale: [1, 5] }],
    samples: [{ sampleId: "s1", humanScores: {}, judgeScores: {} }],
  });
  assert.equal(report.dimensions[0].sampleCount, 0);
  assert.equal(report.dimensions[0].passed, false);
  assert.equal(report.overall.passed, false);
});
