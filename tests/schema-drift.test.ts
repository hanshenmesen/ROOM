import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";
import { CheckReportSchema } from "../schemas/check-report.ts";

/**
 * Anti-drift gate for the Zod-as-single-source schemas (see
 * `schemas/check-report.ts`): the committed `schemas/*.schema.json` file
 * must always equal what `z.toJSONSchema()` produces from the current Zod
 * schema right now. If this fails, either the Zod schema changed and
 * `node scripts/generate-json-schemas.mjs --write` was not run, or the
 * committed JSON file was hand-edited out of sync.
 */
function renderSchema(schema: z.ZodType, id: string, title: string) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  const { $schema, ...rest } = jsonSchema;
  return `${JSON.stringify({ $schema, $id: id, title, ...rest }, null, 2)}\n`;
}

test("check-report.schema.json matches its Zod single source", async () => {
  const expected = renderSchema(
    CheckReportSchema,
    "https://room.dev/schemas/check-report.schema.json",
    "ROOM Check Report",
  );
  const actual = await readFile(new URL("../schemas/check-report.schema.json", import.meta.url), "utf8");
  assert.equal(actual, expected, "Run `node scripts/generate-json-schemas.mjs --write` to regenerate.");
});

test("CheckReportSchema rejects a report missing required structure", () => {
  const result = CheckReportSchema.safeParse({ passed: true, score: 42 });
  assert.equal(result.success, false);
});

test("CheckReportSchema accepts a well-formed report", () => {
  const result = CheckReportSchema.safeParse({
    passed: true,
    score: 92,
    summary: "All checks passed.",
    checks: Array.from({ length: 5 }, (_, index) => ({
      name: `check-${index}`,
      passed: true,
      detail: "ok",
    })),
    issues: [],
  });
  assert.equal(result.success, true);
});
