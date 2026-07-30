import type { CheckReport, ParsedProfile, WorldPlan } from "./types.ts";

export function validateProfile(profile: ParsedProfile) {
  const errors: string[] = [];
  if (!profile.id || !profile.name) errors.push("profile identity is required");
  if (!profile.items.length) errors.push("at least one profile item is required");
  if (profile.items.some((item) => !item.evidence.length)) errors.push("every profile item needs evidence");
  if (profile.skills.some((skill) => !profile.skillEvidence[skill])) errors.push("every skill needs evidence mapping");
  return errors;
}

export function validateWorld(world: WorldPlan) {
  const errors: string[] = [];
  if (world.version !== "0.1.0") errors.push("unsupported world version");
  if (world.rooms.length < 2) errors.push("the focused MVP requires one public showroom and one private bedroom");
  if (new Set(world.exhibits.map((item) => item.sourceItemId)).size !== world.exhibits.length) errors.push("source items must map one-to-one");
  return errors;
}

export function validateReport(report: CheckReport) {
  return report.score >= 0 && report.score <= 100 && report.checks.length >= 5
    ? []
    : ["invalid checker report"];
}
