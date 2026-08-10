#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractWebPage } from "../lib/extract-webpage.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";

const DEFAULT_MANIFEST = new URL("../tests/fixtures/public-profiles.json", import.meta.url);
const DEFAULT_OUTPUT = new URL("../.omx/artifacts/iteration-1/public-profile-audit.json", import.meta.url);
const USER_AGENT = "RoomPublicProfileAudit/1.0 (+https://hanshenmesen.github.io/)";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_500_000;
const ITEM_KIND_ORDER = ["summary", "project", "experience", "education", "achievement"];
const CONTENT_FAMILY_ORDER = ["publication", "talk", "exhibition", "open-source", "media-coverage"];
const PROJECT_METADATA_FIELDS = ["timeRange", "role", "techStack", "projectUrl"];
const MEDIA_CATEGORY_ORDER = [
  "profile-photo",
  "project-cover",
  "logo",
  "screenshot",
  "content",
  "decorative",
  "other",
];

function parseArgs(argv) {
  const positional = argv.slice(2).filter((arg) => !arg.startsWith("--"));
  return {
    manifestPath: positional[0] ? pathToFileURL(resolve(process.cwd(), positional[0])) : DEFAULT_MANIFEST,
    outputPath: positional[1] ? pathToFileURL(resolve(process.cwd(), positional[1])) : DEFAULT_OUTPUT,
  };
}

function countBy(values, keys, keyFn, fallbackKey) {
  const output = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) {
    const key = keyFn(value);
    const targetKey = key in output ? key : fallbackKey;
    if (targetKey && targetKey in output) output[targetKey] += 1;
  }
  return output;
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function emptyProjectMetadataCounts() {
  const fieldCoverage = Object.fromEntries(PROJECT_METADATA_FIELDS.map((key) => [key, 0]));
  const fieldEvidenceCoverage = Object.fromEntries(PROJECT_METADATA_FIELDS.map((key) => [key, 0]));
  const structuredEvidence = Object.fromEntries(
    PROJECT_METADATA_FIELDS.map((key) => [key, { withMatchingEvidence: 0, withoutMatchingEvidence: 0 }]),
  );
  return {
    projectCount: 0,
    fieldCoverage,
    projectUrl: {
      validHttp: 0,
      missing: 0,
      placeholderOrInvalid: 0,
    },
    fieldEvidenceCoverage,
    structuredEvidence,
  };
}

function hasFieldValue(item, field) {
  const value = item[field];
  if (Array.isArray(value)) return value.length > 0;
  return hasNonEmptyString(value);
}

function isValidHttpUrl(value) {
  if (!hasNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlaceholderOrInvalidUrl(value) {
  if (!hasNonEmptyString(value)) return false;
  if (/^(n\/a|none|null|unknown|placeholder|system|generated|about:blank|#)$/i.test(value.trim())) return true;
  return !isValidHttpUrl(value);
}

function summarizeProjectMetadata(projects) {
  const output = emptyProjectMetadataCounts();
  output.projectCount = projects.length;

  for (const project of projects) {
    for (const field of PROJECT_METADATA_FIELDS) {
      const hasValue = hasFieldValue(project, field);
      const hasEvidence = Array.isArray(project.fieldEvidence?.[field]) && project.fieldEvidence[field].length > 0;
      if (hasValue) {
        output.fieldCoverage[field] += 1;
        if (hasEvidence) {
          output.structuredEvidence[field].withMatchingEvidence += 1;
        } else {
          output.structuredEvidence[field].withoutMatchingEvidence += 1;
        }
      }
      if (hasEvidence) output.fieldEvidenceCoverage[field] += 1;
    }

    if (isValidHttpUrl(project.projectUrl)) {
      output.projectUrl.validHttp += 1;
    } else if (!hasNonEmptyString(project.projectUrl)) {
      output.projectUrl.missing += 1;
    } else if (isPlaceholderOrInvalidUrl(project.projectUrl)) {
      output.projectUrl.placeholderOrInvalid += 1;
    }
  }

  return output;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${ms}ms`)), ms);
  return {
    controller,
    clear() {
      clearTimeout(timer);
    },
  };
}

async function fetchHtml(url, { timeoutMs, maxBytes, userAgent }) {
  const { controller, clear } = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": userAgent,
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        contentType,
        bytes: contentLength,
        error: `content-length ${contentLength} exceeds limit ${maxBytes}`,
      };
    }
    if (response.body == null) {
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > maxBytes) {
        return {
          ok: false,
          status: response.status,
          finalUrl: response.url,
          contentType,
          bytes,
          error: `response body ${bytes} bytes exceeds limit ${maxBytes}`,
        };
      }
      return {
        ok: response.ok,
        status: response.status,
        finalUrl: response.url,
        contentType,
        bytes,
        html: text,
      };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        controller.abort(new Error(`response body exceeded limit ${maxBytes}`));
        return {
          ok: false,
          status: response.status,
          finalUrl: response.url,
          contentType,
          bytes,
          error: `response body ${bytes} bytes exceeds limit ${maxBytes}`,
        };
      }
      chunks.push(value);
    }

    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const html = new TextDecoder().decode(merged);
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType,
      bytes,
      html,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clear();
  }
}

function summarizeExtraction(result) {
  const itemsByKind = countBy(result.profile.items, ITEM_KIND_ORDER, (item) => item.kind);
  const projects = result.profile.items.filter((item) => item.kind === "project");
  const itemsByContentFamily = countBy(
    result.profile.items.filter((item) => item.contentFamily),
    CONTENT_FAMILY_ORDER,
    (item) => item.contentFamily,
  );
  const mediaByCategory = countBy(result.profile.media, MEDIA_CATEGORY_ORDER, (item) => item.category, "other");
  return {
    fieldPresence: {
      name: hasNonEmptyString(result.profile.name),
      headline: hasNonEmptyString(result.profile.headline),
      location: hasNonEmptyString(result.profile.location),
      summary: hasNonEmptyString(result.profile.summary),
      items: result.profile.items.length > 0,
      skills: result.profile.skills.length > 0,
      contacts: result.profile.contacts.length > 0,
      media: result.profile.media.length > 0,
    },
    counts: {
      itemsByKind,
      itemsByContentFamily,
      skillCount: result.profile.skills.length,
      contactCount: result.profile.contacts.length,
      projectCount: projects.length,
      itemsWithEvidence: result.profile.items.filter((item) => item.evidence.length > 0).length,
      itemsWithSourceUrl: result.profile.items.filter((item) => hasNonEmptyString(item.sourceUrl)).length,
      projectsWithRealImage: projects.filter((item) => hasNonEmptyString(item.imageUrl)).length,
      projectMetadata: summarizeProjectMetadata(projects),
      mediaByCategory,
    },
  };
}

function summarizeExpectations(sample, extraction) {
  const expectedFields = Array.isArray(sample.expectedFields) ? sample.expectedFields : [];
  const expectedMediaCategories = Array.isArray(sample.expectedMediaCategories)
    ? sample.expectedMediaCategories
    : [];
  const expectedProjectMetadataFields = Array.isArray(sample.expectedProjectMetadataFields)
    ? sample.expectedProjectMetadataFields
    : [];
  const expectedRealProjectCount = Number.isInteger(sample.expectedRealProjectCount)
    ? sample.expectedRealProjectCount
    : null;
  const expected = {
    fields: expectedFields,
    mediaCategories: expectedMediaCategories,
    projectMetadataFields: expectedProjectMetadataFields,
    realProjectCount: expectedRealProjectCount,
  };

  if (!extraction) {
    return {
      checked: false,
      passed: null,
      expected,
      actual: null,
      failures: [],
    };
  }

  const actualFields = Object.fromEntries(
    expectedFields.map((field) => [field, extraction.fieldPresence[field] === true]),
  );
  const actualMediaCategories = Object.fromEntries(
    expectedMediaCategories.map((category) => [category, extraction.counts.mediaByCategory[category] || 0]),
  );
  const actualProjectMetadataFields = Object.fromEntries(
    expectedProjectMetadataFields.map((field) => {
      const coverage = extraction.counts.projectMetadata.fieldCoverage[field] || 0;
      const withMatchingEvidence =
        extraction.counts.projectMetadata.structuredEvidence[field]?.withMatchingEvidence || 0;
      return [field, { coverage, withMatchingEvidence }];
    }),
  );
  const actualRealProjectCount = extraction.counts.projectCount;
  const failures = [];

  for (const [field, present] of Object.entries(actualFields)) {
    if (!present) failures.push(`expected field ${field} to be present`);
  }
  for (const [category, count] of Object.entries(actualMediaCategories)) {
    if (count < 1) failures.push(`expected media category ${category} to have at least one item`);
  }
  for (const [field, coverage] of Object.entries(actualProjectMetadataFields)) {
    if (coverage.coverage < 1) {
      failures.push(`expected project metadata field ${field} to be present`);
    } else if (coverage.withMatchingEvidence < coverage.coverage) {
      failures.push(`expected project metadata field ${field} to retain matching evidence`);
    }
  }
  if (expectedRealProjectCount !== null && actualRealProjectCount !== expectedRealProjectCount) {
    failures.push(
      `expected ${expectedRealProjectCount} real projects, extracted ${actualRealProjectCount}`,
    );
  }

  return {
    checked: true,
    passed: failures.length === 0,
    expected,
    actual: {
      fields: actualFields,
      mediaCategories: actualMediaCategories,
      projectMetadataFields: actualProjectMetadataFields,
      realProjectCount: actualRealProjectCount,
    },
    failures,
  };
}

async function main() {
  const { manifestPath, outputPath } = parseArgs(process.argv);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const results = [];
  const coveredRoles = new Map();
  const requiredRoles = Array.isArray(manifest.requiredRoles) ? manifest.requiredRoles : [];

  for (const sample of manifest.samples || []) {
    const fetchResult = await fetchHtml(sample.url, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      userAgent: USER_AGENT,
    });

    if (!fetchResult.ok || !fetchResult.html) {
      results.push({
        id: sample.id,
        url: sample.url,
        http: fetchResult.status || fetchResult.contentType
          ? {
              status: fetchResult.status ?? null,
              contentType: fetchResult.contentType ?? "",
              bytes: fetchResult.bytes ?? null,
              finalUrl: fetchResult.finalUrl ?? null,
            }
          : null,
        error: fetchResult.error || "fetch failed",
        fieldPresence: {
          name: false,
          headline: false,
          summary: false,
          items: false,
          skills: false,
          contacts: false,
          media: false,
        },
        counts: {
          itemsByKind: Object.fromEntries(ITEM_KIND_ORDER.map((key) => [key, 0])),
          itemsByContentFamily: Object.fromEntries(CONTENT_FAMILY_ORDER.map((key) => [key, 0])),
          skillCount: 0,
          contactCount: 0,
          projectCount: 0,
          itemsWithEvidence: 0,
          itemsWithSourceUrl: 0,
          projectsWithRealImage: 0,
          projectMetadata: emptyProjectMetadataCounts(),
          mediaByCategory: Object.fromEntries(MEDIA_CATEGORY_ORDER.map((key) => [key, 0])),
        },
        roleCoverage: sample.roles || [],
        expectations: summarizeExpectations(sample, null),
      });
      continue;
    }

    try {
      const page = extractWebPage(fetchResult.html, fetchResult.finalUrl || sample.url);
      const pipeline = runPipeline(page.text, {
        type: "url",
        label: sample.url,
        media: page.media,
      });
      const extraction = summarizeExtraction(pipeline);
      const roleCoverage = Array.isArray(sample.roles) ? sample.roles : [];
      for (const role of roleCoverage) coveredRoles.set(role, (coveredRoles.get(role) || 0) + 1);

      results.push({
        id: sample.id,
        url: sample.url,
        http: {
          status: fetchResult.status,
          contentType: fetchResult.contentType,
          bytes: fetchResult.bytes,
          finalUrl: fetchResult.finalUrl,
        },
        error: null,
        fieldPresence: extraction.fieldPresence,
        counts: extraction.counts,
        roleCoverage,
        expectations: summarizeExpectations(sample, extraction),
      });
    } catch (error) {
      results.push({
        id: sample.id,
        url: sample.url,
        http: {
          status: fetchResult.status ?? null,
          contentType: fetchResult.contentType ?? "",
          bytes: fetchResult.bytes ?? null,
          finalUrl: fetchResult.finalUrl ?? null,
        },
        error: error instanceof Error ? error.message : String(error),
        fieldPresence: {
          name: false,
          headline: false,
          summary: false,
          items: false,
          skills: false,
          contacts: false,
          media: false,
        },
        counts: {
          itemsByKind: Object.fromEntries(ITEM_KIND_ORDER.map((key) => [key, 0])),
          itemsByContentFamily: Object.fromEntries(CONTENT_FAMILY_ORDER.map((key) => [key, 0])),
          skillCount: 0,
          contactCount: 0,
          projectCount: 0,
          itemsWithEvidence: 0,
          itemsWithSourceUrl: 0,
          projectsWithRealImage: 0,
          projectMetadata: emptyProjectMetadataCounts(),
          mediaByCategory: Object.fromEntries(MEDIA_CATEGORY_ORDER.map((key) => [key, 0])),
        },
        roleCoverage: sample.roles || [],
        expectations: summarizeExpectations(sample, null),
      });
    }
  }

  const successful = results.filter((entry) => !entry.error);
  const covered = new Set(coveredRoles.keys());
  const missingRoles = requiredRoles.filter((role) => !covered.has(role));
  const expectationFailures = results
    .filter((entry) => entry.expectations.passed === false)
    .map((entry) => ({
      id: entry.id,
      url: entry.url,
      failures: entry.expectations.failures,
    }));
  const summary = {
    total: results.length,
    succeeded: successful.length,
    failed: results.length - successful.length,
    requiredRoles,
    coveredRoles: [...covered].sort(),
    missingRoles,
    expectationFailureCount: expectationFailures.length,
    expectationFailures,
  };

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    manifestPath: String(manifestPath),
    summary,
    results,
  };

  await mkdir(new URL(".", outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${outputPath.pathname}`);
  console.log(`Success ${summary.succeeded}/${summary.total}; coverage ${summary.coveredRoles.length}/${summary.requiredRoles.length}`);
  if (successful.length) {
    console.log(`Succeeded: ${successful.map((entry) => entry.url).join(", ")}`);
  }
  const failures = results.filter((entry) => entry.error);
  if (failures.length) {
    console.log(`Failed: ${failures.map((entry) => entry.url).join(", ")}`);
  }
  if (expectationFailures.length) {
    console.error(
      `Expectation failures: ${expectationFailures
        .map((entry) => `${entry.id || entry.url}: ${entry.failures.join("; ")}`)
        .join(" | ")}`,
    );
  }
  if (!successful.length || missingRoles.length || expectationFailures.length) {
    console.error(
      !successful.length
        ? "No samples succeeded."
        : missingRoles.length
          ? `Missing required role coverage: ${missingRoles.join(", ")}`
          : "One or more successful samples did not meet their manifest expectations.",
    );
    process.exitCode = 1;
  }
}

await main();
