import assert from "node:assert/strict";
import test from "node:test";
import { parseProfile } from "../lib/agents/parser.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import {
  mergeProfiles,
  mergeProfilesWithReport,
  ProfileReviewRequiredError,
  resolveProfileMergeReview,
  type ProfileMergeReport,
} from "../lib/profile-merge.ts";

function profilesWithConflict() {
  const primary = parseProfile(sampleResume, { type: "text", label: "公开简历" });
  const supplement = structuredClone(primary);
  supplement.source = { ...supplement.source, id: "website-source", type: "url", label: "公开个人网站" };
  supplement.headline = "AI Agent Research Engineer";
  supplement.identityEvidence.headline = [{
    sourceId: supplement.source.id,
    locator: "line:2",
    excerpt: "AI Agent Research Engineer",
    origin: "source",
  }];
  supplement.summary = `${primary.summary} 网站还介绍了近期研究方向。`;
  supplement.identityEvidence.summary = [{
    sourceId: supplement.source.id,
    locator: "line:3",
    excerpt: "网站还介绍了近期研究方向",
    origin: "source",
  }];
  return { primary, supplement };
}

test("high-risk disagreements require review and low-risk summary differences use evidence policy", () => {
  const { primary, supplement } = profilesWithConflict();
  const first = mergeProfilesWithReport(primary, supplement, "公开简历 + 公开个人网站");
  const repeated = mergeProfilesWithReport(primary, supplement, "公开简历 + 公开个人网站");
  assert.equal(first.reviewRequired, true);
  assert.deepEqual(first.conflicts, repeated.conflicts);
  assert.equal(first.conflicts.length, 1);
  assert.equal(first.conflicts[0]?.target.scope, "profile");
  assert.equal(first.conflicts[0]?.target.field, "headline");
  assert.equal(first.conflicts[0]?.resolution, "user_required");
  assert.equal(first.conflicts[0]?.primary?.evidence.length, 1);
  assert.equal(first.conflicts[0]?.supplement?.evidence[0]?.sourceId, "website-source");
  assert.equal(first.merged.headline, primary.headline, "the provisional value follows source priority");
  assert.equal(first.merged.summary, primary.summary, "summary length is not treated as confidence");
  assert.match(
    first.decisions.find((decision) => decision.target.scope === "profile" && decision.target.field === "summary")?.reason || "",
    /未使用字符串长度/,
  );
  assert.throws(
    () => mergeProfiles(primary, supplement, "公开简历 + 公开个人网站"),
    ProfileReviewRequiredError,
    "legacy callers cannot silently consume a provisional conflict value",
  );
});

test("reviewed edits become user-confirmed claims and cannot be overwritten by a later Agent merge", () => {
  const { primary, supplement } = profilesWithConflict();
  const report = mergeProfilesWithReport(primary, supplement, "公开简历 + 公开个人网站");
  const conflict = report.conflicts[0];
  assert.ok(conflict);
  const reviewed = resolveProfileMergeReview(report, [{
    conflictId: conflict.conflictId,
    action: "edit",
    value: "Agent Systems Engineer",
  }]);
  assert.equal(reviewed.profile.headline, "Agent Systems Engineer");
  assert.equal(reviewed.userClaims[0]?.action, "edit");
  assert.equal(reviewed.userClaims[0]?.extractionMethod, "user");
  assert.equal(reviewed.profile.identityEvidence.headline?.[0]?.origin, "user-confirmed");
  assert.match(reviewed.profile.identityEvidence.headline?.[0]?.locator || "", /^user:/);

  const laterAgentResult = structuredClone(supplement);
  laterAgentResult.headline = "Autonomous Agent Developer";
  laterAgentResult.identityEvidence.headline = [{
    sourceId: "later-agent",
    locator: "line:9",
    excerpt: "Autonomous Agent Developer",
  }];
  const laterMerge = mergeProfilesWithReport(reviewed.profile, laterAgentResult, "已确认 Profile + 新网站");
  assert.equal(laterMerge.reviewRequired, false);
  assert.equal(laterMerge.merged.headline, "Agent Systems Engineer");
  assert.equal(
    laterMerge.decisions.find((decision) => decision.target.scope === "profile" && decision.target.field === "headline")?.resolution,
    "user",
  );
});

test("review resolution is complete, unique and version checked", () => {
  const { primary, supplement } = profilesWithConflict();
  const report = mergeProfilesWithReport(primary, supplement, "公开简历 + 公开个人网站");
  assert.throws(() => resolveProfileMergeReview(report, []), /尚未确认/);
  const conflictId = report.conflicts[0]?.conflictId || "missing";
  assert.throws(() => resolveProfileMergeReview(report, [
    { conflictId, action: "primary" },
    { conflictId, action: "supplement" },
  ]), /多个决议/);
  assert.throws(() => resolveProfileMergeReview({
    ...report,
    schemaVersion: "profile-merge-report.v999",
  } as unknown as ProfileMergeReport, [{ conflictId, action: "primary" }]), /不支持/);
});

test("missing key evidence, phone disclosure and low-confidence media become explicit review gates", () => {
  const primary = parseProfile(sampleResume, { type: "text", label: "公开简历" });
  primary.personalWebsite = "https://portfolio.example/";
  delete primary.personalWebsiteEvidence;
  primary.contacts.push("+86 138 0013 8000");
  primary.contactEvidence["+86 138 0013 8000"] = [{
    sourceId: primary.source.id,
    locator: "line:4",
    excerpt: "+86 138 0013 8000",
  }];
  primary.media.push({
    url: "https://portfolio.example/possible-avatar.jpg",
    originalUrl: "/possible-avatar.jpg",
    sourcePage: "https://portfolio.example/",
    locator: "img:1",
    alt: "possible portrait",
    kind: "profile",
    category: "profile-photo",
    categoryConfidence: 0.4,
    categoryReason: "weak visual hint",
  });
  const supplement = structuredClone(primary);
  const report = mergeProfilesWithReport(primary, supplement, "公开简历 + 公开网站");
  assert.deepEqual(
    new Set(report.conflicts.map((conflict) => conflict.target.scope)),
    new Set(["profile", "contact", "media"]),
  );
  const resolutions = report.conflicts.map((conflict) => ({
    conflictId: conflict.conflictId,
    action: conflict.target.scope === "contact" ? "reject" as const : "primary" as const,
  }));
  const reviewed = resolveProfileMergeReview(report, resolutions);
  assert.equal(reviewed.profile.contacts.includes("+86 138 0013 8000"), false);
  assert.equal(reviewed.profile.personalWebsiteEvidence?.at(-1)?.origin, "user-confirmed");
  assert.equal(reviewed.profile.media[0]?.categoryConfidence, 1);
  assert.equal(reviewed.profile.media[0]?.categoryReason, "user-confirmed");
  assert.equal(
    report.conflicts.find((conflict) => conflict.target.scope === "media")?.primary?.confidence,
    0.4,
  );
  const websiteConflict = report.conflicts.find((conflict) => (
    conflict.target.scope === "profile" && conflict.target.field === "personalWebsite"
  ));
  assert.ok(websiteConflict);
  assert.throws(() => resolveProfileMergeReview(report, report.conflicts.map((conflict) => ({
    conflictId: conflict.conflictId,
    action: conflict.conflictId === websiteConflict.conflictId ? "edit" as const : "primary" as const,
    ...(conflict.conflictId === websiteConflict.conflictId ? { value: "http://localhost/private" } : {}),
  }))), /安全、公开/);
});
