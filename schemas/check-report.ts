import { z } from "zod";

/**
 * Single source of truth for the Check Report shape: the TS type
 * (`z.infer`), the runtime validator (`CheckReportSchema.safeParse`), and
 * the JSON Schema committed at `schemas/check-report.schema.json` (see
 * `scripts/generate-json-schemas.mjs`) all derive from this one Zod schema
 * instead of being maintained as three independent, drift-prone
 * definitions.
 *
 * This is the pilot for ROOM's Zod-as-single-source migration:
 * `check-report` was picked because it is small and
 * has no existing hand-rolled parser to reconcile. Other Artifacts
 * (`profile`, `world`, tool schemas) migrate independently, one schema per
 * change.
 */
export const CheckIssueSchema = z.object({
  id: z.string(),
  category: z.enum(["content", "overlap", "interaction", "performance", "navigation"]),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  entityIds: z.array(z.string()),
  suggestion: z.string(),
});

export const CheckItemSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

export const CheckReportSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  summary: z.string(),
  checks: z.array(CheckItemSchema).min(5),
  issues: z.array(CheckIssueSchema),
});

export type CheckIssueShape = z.infer<typeof CheckIssueSchema>;
export type CheckItemShape = z.infer<typeof CheckItemSchema>;
export type CheckReportShape = z.infer<typeof CheckReportSchema>;
