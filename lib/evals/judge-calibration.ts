/**
 * LLM-as-a-Judge calibration.
 *
 * Deterministic gold-label metrics cover factual Profile extraction, but
 * narrative quality (3D storytelling, exhibit copy) has no gold answer. An
 * LLM Judge can score those dimensions — but its scores are only meaningful
 * after calibration against human ratings on the same samples. This module
 * computes that calibration without any model calls:
 *
 * - exact / within-one agreement per rubric dimension;
 * - mean absolute error;
 * - quadratically weighted Cohen's kappa (ordinal agreement beyond chance).
 *
 * A Judge dimension is only "calibrated" when kappa and within-one agreement
 * clear explicit thresholds; until then its scores must not be quoted as
 * quality evidence.
 */

export const JUDGE_CALIBRATION_REPORT_SCHEMA = "judge-calibration-report.v1" as const;

export type JudgeRubricDimension = {
  id: string;
  label: string;
  /** Ordinal scale bounds, e.g. [1, 5]. */
  scale: [number, number];
  description?: string;
};

export type JudgeCalibrationSample = {
  sampleId: string;
  humanScores: Record<string, number>;
  judgeScores: Record<string, number>;
};

export type JudgeCalibrationThresholds = {
  minWeightedKappa: number;
  minWithinOneAgreement: number;
};

export const DEFAULT_JUDGE_CALIBRATION_THRESHOLDS: JudgeCalibrationThresholds = {
  minWeightedKappa: 0.6,
  minWithinOneAgreement: 0.9,
};

export type JudgeDimensionCalibration = {
  dimensionId: string;
  label: string;
  sampleCount: number;
  exactAgreement: number;
  withinOneAgreement: number;
  meanAbsoluteError: number;
  weightedKappa?: number;
  passed: boolean;
};

export type JudgeCalibrationReport = {
  schemaVersion: typeof JUDGE_CALIBRATION_REPORT_SCHEMA;
  generatedAt: string;
  sampleCount: number;
  thresholds: JudgeCalibrationThresholds;
  dimensions: JudgeDimensionCalibration[];
  overall: {
    meanWeightedKappa?: number;
    passed: boolean;
  };
};

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Quadratically weighted Cohen's kappa over an ordinal scale.
 * Returns `undefined` when the expected disagreement is zero (degenerate
 * margins, e.g. every rating identical) because kappa is then undefined.
 */
export function weightedKappa(pairs: Array<{ human: number; judge: number }>, scale: [number, number]): number | undefined {
  const [min, max] = scale;
  const categories = max - min + 1;
  if (categories < 2 || pairs.length === 0) return undefined;

  const observed = Array.from({ length: categories }, () => new Array<number>(categories).fill(0));
  const humanMargins = new Array<number>(categories).fill(0);
  const judgeMargins = new Array<number>(categories).fill(0);
  for (const { human, judge } of pairs) {
    const h = human - min;
    const j = judge - min;
    observed[h][j] += 1;
    humanMargins[h] += 1;
    judgeMargins[j] += 1;
  }

  const normalizer = (categories - 1) ** 2;
  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (let i = 0; i < categories; i += 1) {
    for (let j = 0; j < categories; j += 1) {
      const weight = ((i - j) ** 2) / normalizer;
      observedDisagreement += weight * observed[i][j];
      expectedDisagreement += weight * (humanMargins[i] * judgeMargins[j]) / pairs.length;
    }
  }
  if (expectedDisagreement === 0) return undefined;
  return round4(1 - observedDisagreement / expectedDisagreement);
}

export function calibrateJudge(input: {
  dimensions: JudgeRubricDimension[];
  samples: JudgeCalibrationSample[];
  thresholds?: JudgeCalibrationThresholds;
  generatedAt?: string;
}): JudgeCalibrationReport {
  const thresholds = input.thresholds ?? DEFAULT_JUDGE_CALIBRATION_THRESHOLDS;
  const dimensions = input.dimensions.map((dimension): JudgeDimensionCalibration => {
    const pairs = input.samples
      .filter((sample) => sample.humanScores[dimension.id] !== undefined && sample.judgeScores[dimension.id] !== undefined)
      .map((sample) => ({ human: sample.humanScores[dimension.id], judge: sample.judgeScores[dimension.id] }));
    for (const pair of pairs) {
      for (const [side, value] of [["human", pair.human], ["judge", pair.judge]] as const) {
        if (!Number.isInteger(value) || value < dimension.scale[0] || value > dimension.scale[1]) {
          throw new Error(`Calibration ${side} score ${value} is outside the ${dimension.id} scale [${dimension.scale[0]}, ${dimension.scale[1]}].`);
        }
      }
    }
    const exact = pairs.filter((pair) => pair.human === pair.judge).length;
    const withinOne = pairs.filter((pair) => Math.abs(pair.human - pair.judge) <= 1).length;
    const mae = pairs.length
      ? pairs.reduce((total, pair) => total + Math.abs(pair.human - pair.judge), 0) / pairs.length
      : 0;
    const kappa = weightedKappa(pairs, dimension.scale);
    const withinOneAgreement = pairs.length ? round4(withinOne / pairs.length) : 0;
    const passed = pairs.length > 0
      && kappa !== undefined
      && kappa >= thresholds.minWeightedKappa
      && withinOneAgreement >= thresholds.minWithinOneAgreement;
    return {
      dimensionId: dimension.id,
      label: dimension.label,
      sampleCount: pairs.length,
      exactAgreement: pairs.length ? round4(exact / pairs.length) : 0,
      withinOneAgreement,
      meanAbsoluteError: round4(mae),
      weightedKappa: kappa,
      passed,
    };
  });

  const kappas = dimensions.map((dimension) => dimension.weightedKappa).filter((value): value is number => value !== undefined);
  return {
    schemaVersion: JUDGE_CALIBRATION_REPORT_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sampleCount: input.samples.length,
    thresholds,
    dimensions,
    overall: {
      meanWeightedKappa: kappas.length ? round4(kappas.reduce((total, value) => total + value, 0) / kappas.length) : undefined,
      passed: dimensions.length > 0 && dimensions.every((dimension) => dimension.passed),
    },
  };
}
