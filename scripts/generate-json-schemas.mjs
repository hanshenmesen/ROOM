#!/usr/bin/env node
// Regenerates the committed `schemas/*.schema.json` files from their Zod
// single source (see `schemas/check-report.ts`'s doc comment).
//
// Usage:
//   node scripts/generate-json-schemas.mjs           # check for drift (exit 1 if stale)
//   node scripts/generate-json-schemas.mjs --write    # regenerate the files in place

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CheckReportSchema } from "../schemas/check-report.ts";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const write = process.argv.includes("--write");

// One entry per Zod-sourced schema. Add a row here as more Artifacts
// migrate off hand-written JSON Schema files (see the ADR/ROADMAP note in
// `schemas/check-report.ts`).
const targets = [
  {
    id: "https://room.dev/schemas/check-report.schema.json",
    title: "ROOM Check Report",
    schema: CheckReportSchema,
    outFile: "schemas/check-report.schema.json",
  },
];

function renderSchema(target) {
  const jsonSchema = z.toJSONSchema(target.schema, { target: "draft-2020-12" });
  const { $schema, ...rest } = jsonSchema;
  return `${JSON.stringify({
    $schema,
    $id: target.id,
    title: target.title,
    ...rest,
  }, null, 2)}\n`;
}

async function main() {
  let stale = false;
  for (const target of targets) {
    const rendered = renderSchema(target);
    const outPath = path.join(rootDir, target.outFile);
    if (write) {
      await writeFile(outPath, rendered, "utf8");
      console.log(`wrote ${target.outFile}`);
      continue;
    }
    const existing = await readFile(outPath, "utf8").catch(() => "");
    if (existing !== rendered) {
      stale = true;
      console.error(`${target.outFile} is stale relative to its Zod source. Run with --write to regenerate.`);
    }
  }
  if (!write && stale) process.exit(1);
}

await main();
