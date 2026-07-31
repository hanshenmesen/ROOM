import type { CheckReport, ParsedProfile, WorldPlan } from "./types.ts";

export function validateProfile(profile: ParsedProfile) {
  const errors: string[] = [];
  if (!profile.id || !profile.name) errors.push("profile identity is required");
  if (profile.name !== "Untitled profile" && !profile.identityEvidence.name?.length) {
    errors.push("profile name needs source evidence");
  }
  if (profile.headline !== "Profile details unavailable" && !profile.identityEvidence.headline?.length) {
    errors.push("profile headline needs source evidence");
  }
  if (profile.location && !profile.identityEvidence.location?.length) {
    errors.push("profile location needs source evidence");
  }
  if (profile.summary !== "Profile summary unavailable" && !profile.identityEvidence.summary?.length) {
    errors.push("profile summary needs source evidence");
  }
  if (profile.personalWebsite && !profile.personalWebsiteEvidence?.length) {
    errors.push("personal website needs source evidence");
  }
  if (!profile.items.length) errors.push("at least one profile item is required");
  if (profile.items.some((item) => !item.evidence.length)) errors.push("every profile item needs evidence");
  for (const item of profile.items) {
    if (item.summary === "Profile summary unavailable" && item.evidence.some((entry) => entry.origin !== "system-generated")) {
      errors.push(`${item.id} summary placeholder must be system generated`);
    }
    if (item.evidence.some((entry) => entry.origin === "system-generated" && !entry.locator.startsWith("system:"))) {
      errors.push(`${item.id} system evidence needs a system locator`);
    }
    if (item.timeRange && !item.fieldEvidence?.timeRange?.length) errors.push(`${item.id} timeRange needs field evidence`);
    if (item.role && !item.fieldEvidence?.role?.length) errors.push(`${item.id} role needs field evidence`);
    if (item.techStack?.length && !item.fieldEvidence?.techStack?.length) errors.push(`${item.id} techStack needs field evidence`);
    if (item.projectUrl && !item.fieldEvidence?.projectUrl?.length) errors.push(`${item.id} projectUrl needs field evidence`);
  }
  if (profile.skills.some((skill) => !profile.skillEvidence[skill])) errors.push("every skill needs evidence mapping");
  return errors;
}

export function validateWorld(world: WorldPlan) {
  const errors: string[] = [];
  if (world.version !== "0.1.0") errors.push("unsupported world version");
  if (world.rooms.length < 2) errors.push("the focused MVP requires one public showroom and one private bedroom");
  if (new Set(world.exhibits.map((item) => item.sourceItemId)).size !== world.exhibits.length) errors.push("source items must map one-to-one");
  if (new Set(world.displaySurfaces.map((surface) => surface.id)).size !== world.displaySurfaces.length) {
    errors.push("display surface ids must be unique");
  }
  const aggregatedSourceIds = world.displaySurfaces.flatMap((surface) => surface.sourceItemIds);
  const projectSourceIds = new Set(world.exhibits
    .filter((exhibit) => exhibit.eyebrow === "PROJECT")
    .map((exhibit) => exhibit.sourceItemId));
  if (aggregatedSourceIds.some((sourceId) => projectSourceIds.has(sourceId))) {
    errors.push("project source items must use one pedestal display only");
  }
  const expectedAggregatedSourceIds = world.exhibits
    .filter((exhibit) => exhibit.eyebrow !== "PROJECT")
    .map((exhibit) => exhibit.sourceItemId);
  if (expectedAggregatedSourceIds.some((sourceId) => !aggregatedSourceIds.includes(sourceId))) {
    errors.push("every non-project source item needs a display surface");
  }
  for (const surface of world.displaySurfaces) {
    if (!surface.interaction.clickable || !surface.interaction.action) errors.push(`${surface.id} needs an interaction`);
    if (surface.focusTarget.fov <= 0 || surface.focusTarget.fov >= 180) errors.push(`${surface.id} needs a valid focus target`);
  }
  for (const exhibit of world.exhibits) {
    if (exhibit.timeRange && !exhibit.fieldEvidence?.timeRange?.length) errors.push(`${exhibit.id} timeRange needs field evidence`);
    if (exhibit.role && !exhibit.fieldEvidence?.role?.length) errors.push(`${exhibit.id} role needs field evidence`);
    if (exhibit.techStack?.length && !exhibit.fieldEvidence?.techStack?.length) errors.push(`${exhibit.id} techStack needs field evidence`);
    if (exhibit.projectUrl && !exhibit.fieldEvidence?.projectUrl?.length) errors.push(`${exhibit.id} projectUrl needs field evidence`);
  }
  return errors;
}

export function validateReport(report: CheckReport) {
  return report.score >= 0 && report.score <= 100 && report.checks.length >= 5
    ? []
    : ["invalid checker report"];
}
