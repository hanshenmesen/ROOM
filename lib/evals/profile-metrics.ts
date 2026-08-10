import { validateProfile } from "../validate.ts";
import { canonicalizeText, canonicalizeUrl, expectedValues, textMatchesExpected } from "./canonicalize.ts";
import { agentCostMetrics } from "./cost-metrics.ts";
import { evidenceIsValid, profileEvidenceMetrics } from "./evidence-metrics.ts";
import { matchProfileItems } from "./item-matcher.ts";
import type {
  EvalFailure,
  ExpectedText,
  GoldProfileItem,
  ProfileEvalCaseResult,
  ProfileEvalInput,
} from "./types.ts";

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function setMetrics(expected: string[] = [], actual: string[] = []) {
  const expectedSet = new Set(expected.map(canonicalizeText));
  const actualSet = new Set(actual.map(canonicalizeText));
  const matches = [...expectedSet].filter((value) => actualSet.has(value)).length;
  return {
    precision: actualSet.size ? matches / actualSet.size : expectedSet.size ? 0 : 1,
    recall: expectedSet.size ? matches / expectedSet.size : actualSet.size ? 0 : 1,
  };
}

function structuredFieldChecks(
  gold: GoldProfileItem,
  candidate: ProfileEvalInput["profile"]["items"][number],
) {
  const checks: Array<{ path: string; expected: ExpectedText | string[] | string; actual: unknown; passed: boolean }> = [];
  const addText = (field: "timeRange" | "role" | "projectUrl", expected?: ExpectedText) => {
    if (!expected) return;
    checks.push({
      path: `items.${gold.id}.${field}`,
      expected,
      actual: candidate[field],
      passed: textMatchesExpected(candidate[field] as string | undefined, expected, field === "projectUrl"),
    });
  };
  addText("timeRange", gold.timeRange);
  addText("role", gold.role);
  addText("projectUrl", gold.projectUrl);
  if (gold.techStack) {
    const expected = new Set(gold.techStack.map(canonicalizeText));
    const actual = new Set((candidate.techStack || []).map(canonicalizeText));
    checks.push({
      path: `items.${gold.id}.techStack`,
      expected: gold.techStack,
      actual: candidate.techStack || [],
      passed: expected.size === actual.size && [...expected].every((value) => actual.has(value)),
    });
  }
  if (gold.contentFamily) {
    checks.push({
      path: `items.${gold.id}.contentFamily`,
      expected: gold.contentFamily,
      actual: candidate.contentFamily,
      passed: gold.contentFamily === candidate.contentFamily,
    });
  }
  checks.push({
    path: `items.${gold.id}.kind`,
    expected: gold.kind,
    actual: candidate.kind,
    passed: gold.kind === candidate.kind,
  });
  return checks;
}

function factualCandidateText(profile: ProfileEvalInput["profile"]) {
  return canonicalizeText(JSON.stringify({
    name: profile.name,
    headline: profile.headline,
    location: profile.location,
    summary: profile.summary,
    personalWebsite: profile.personalWebsite,
    contacts: profile.contacts,
    foods: profile.foods,
    hobbies: profile.hobbies,
    skills: profile.skills,
    items: profile.items.map((item) => ({
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      summary: item.summary,
      bullets: item.bullets,
      tags: item.tags,
      timeRange: item.timeRange,
      role: item.role,
      techStack: item.techStack,
      projectUrl: item.projectUrl,
    })),
  }));
}

export function evaluateProfileCase(input: ProfileEvalInput): ProfileEvalCaseResult {
  const failures: EvalFailure[] = [];
  const identityChecks: Array<{ path: string; expected: ExpectedText; actual?: string; url?: boolean }> = [
    { path: "identity.name", expected: input.gold.expected.identity.name, actual: input.profile.name },
  ];
  const identity = input.gold.expected.identity;
  if (identity.headline) identityChecks.push({ path: "identity.headline", expected: identity.headline, actual: input.profile.headline });
  if (identity.location) identityChecks.push({ path: "identity.location", expected: identity.location, actual: input.profile.location });
  if (identity.personalWebsite) {
    identityChecks.push({ path: "identity.personalWebsite", expected: identity.personalWebsite, actual: input.profile.personalWebsite, url: true });
  }
  let identityMatches = 0;
  for (const check of identityChecks) {
    if (textMatchesExpected(check.actual, check.expected, check.url)) {
      identityMatches += 1;
      continue;
    }
    failures.push({
      category: "identity_mismatch",
      path: check.path,
      message: `${check.path} did not match the Gold value.`,
      expected: expectedValues(check.expected),
      actual: check.actual,
    });
  }

  const itemResult = matchProfileItems(input.gold.expected.items, input.profile.items);
  for (const item of itemResult.missed) {
    failures.push({
      category: "missed_item",
      path: `items.${item.id}`,
      message: `Gold item was not extracted: ${item.canonicalTitle}.`,
      expected: item.canonicalTitle,
    });
  }
  for (const item of itemResult.unexpected) {
    failures.push({
      category: "unexpected_item",
      path: `items.${item.id}`,
      message: `Extracted item does not match any Gold item: ${item.title}.`,
      actual: item.title,
    });
  }

  const fieldChecks = itemResult.matches.flatMap(({ gold, candidate }) => structuredFieldChecks(gold, candidate));
  for (const check of fieldChecks) {
    if (check.passed) continue;
    failures.push({
      category: "field_mismatch",
      path: check.path,
      message: `${check.path} did not match the Gold value.`,
      expected: check.expected,
      actual: check.actual,
    });
  }

  for (const { gold, candidate } of itemResult.matches) {
    for (const phrase of gold.expectedEvidence || []) {
      const normalizedPhrase = canonicalizeText(phrase);
      const supported = candidate.evidence.some((entry) => (
        evidenceIsValid(entry, input.sourceText)
        && canonicalizeText(entry.excerpt).includes(normalizedPhrase)
      ));
      if (!supported) {
        failures.push({
          category: "invalid_evidence",
          path: `items.${gold.id}.evidence`,
          message: `No valid candidate evidence contains the expected phrase: ${phrase}.`,
          expected: phrase,
          actual: candidate.evidence.map((entry) => entry.excerpt),
        });
      }
    }
  }

  const evidence = profileEvidenceMetrics(input.profile, input.sourceText);
  evidence.missingEvidencePaths.forEach((path) => failures.push({
    category: "missing_evidence",
    path,
    message: `${path} has no source evidence.`,
  }));
  evidence.invalidEvidencePaths.forEach((path) => failures.push({
    category: "invalid_evidence",
    path,
    message: `${path} does not point to supporting source text.`,
  }));

  const candidateText = factualCandidateText(input.profile);
  for (const claim of input.gold.expected.forbiddenClaims || []) {
    if (!candidateText.includes(canonicalizeText(claim))) continue;
    failures.push({
      category: "forbidden_claim",
      path: "profile",
      message: `Forbidden claim appeared in the candidate profile: ${claim}.`,
      expected: "absent",
      actual: claim,
    });
  }

  const profileErrors = validateProfile(input.profile);
  const endToEndSuccess = profileErrors.length === 0 && (input.pipeline?.report.passed ?? true) ? 1 : 0;
  if (!endToEndSuccess) {
    failures.push({
      category: "pipeline_failure",
      path: "pipeline",
      message: "The candidate did not pass the Profile and World contracts.",
      actual: profileErrors.length ? profileErrors : input.pipeline?.report.issues,
    });
  }

  const matchedCount = itemResult.matches.length;
  const candidateCount = matchedCount + itemResult.unexpected.length;
  const goldCount = input.gold.expected.items.length;
  const itemPrecision = candidateCount ? matchedCount / candidateCount : goldCount ? 0 : 1;
  const itemRecall = goldCount ? matchedCount / goldCount : candidateCount ? 0 : 1;
  const itemF1 = itemPrecision + itemRecall ? (2 * itemPrecision * itemRecall) / (itemPrecision + itemRecall) : 0;
  const skills = setMetrics(input.gold.expected.skills, input.profile.skills);
  const costs = agentCostMetrics(input.events);
  return {
    caseId: input.gold.id,
    reviewStatus: input.gold.reviewStatus,
    passed: failures.length === 0,
    metrics: {
      identityAccuracy: round(identityChecks.length ? identityMatches / identityChecks.length : 1),
      itemPrecision: round(itemPrecision),
      itemRecall: round(itemRecall),
      itemF1: round(itemF1),
      fieldAccuracy: round(fieldChecks.length ? fieldChecks.filter((check) => check.passed).length / fieldChecks.length : 1),
      skillPrecision: round(skills.precision),
      skillRecall: round(skills.recall),
      evidenceCoverage: round(evidence.evidenceCoverage),
      evidenceAccuracy: round(evidence.evidenceAccuracy),
      unsupportedClaimRate: round(evidence.unsupportedClaimRate),
      ...costs,
      endToEndSuccess,
    },
    failures,
    matchedItems: itemResult.matches.map((match) => ({
      goldItemId: match.gold.id,
      candidateItemId: match.candidate.id,
      score: round(match.score),
    })),
  };
}

export function profileCaseContainsExpectedSourceEvidence(gold: ProfileEvalInput["gold"], sourceText: string) {
  const normalizedSource = canonicalizeText(sourceText);
  return gold.expected.items.every((item) => (
    (item.expectedEvidence || []).every((phrase) => normalizedSource.includes(canonicalizeText(phrase)))
  ));
}

export function canonicalExpectedUrl(value: ExpectedText) {
  return expectedValues(value).map(canonicalizeUrl);
}
