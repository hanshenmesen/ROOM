import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingSource = readFileSync(new URL("../components/ProductFlowLanding.tsx", import.meta.url), "utf8");
const landingStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const parseRouteSource = readFileSync(new URL("../app/api/parse/route.ts", import.meta.url), "utf8");
const reviewSource = readFileSync(new URL("../components/ProfileReviewPanel.tsx", import.meta.url), "utf8");
const tracePanelSource = readFileSync(new URL("../components/AgentTracePanel.tsx", import.meta.url), "utf8");

test("the landing is rebuilt from independently positioned PPT artwork", () => {
  for (const asset of [
    "room-logo.webp",
    "owner.png",
    "resume-paper.png",
    "web-profile.webp",
    "agent-parser.png",
    "agent-director.png",
    "agent-orchestrator.png",
    "agent-checker.png",
    "house.webp",
    "visitor.png",
  ]) {
    assert.match(landingSource, new RegExp(asset.replace(".", "\\.")));
  }

  assert.doesNotMatch(landingSource, /room-flow-reference\.png|blueprint-copy-mask|blueprint-artwork/);
  assert.match(landingSource, /flow-step-source/);
  assert.match(landingSource, /flow-step-agents/);
  assert.match(landingSource, /flow-step-result/);
  assert.match(landingStyles, /\.flow-landing\s*\{[^}]*height: 100dvh;[^}]*overflow: hidden;/);
  assert.match(landingStyles, /\.flow-layout\s*\{[^}]*display: grid;[^}]*grid-template-columns:/);
});

test("the landing uses the editorial world headline and stays overflow-free", () => {
  assert.match(landingSource, /把你的经历，变成你的世界。/);
  assert.match(landingStyles, /@media \(max-width: 760px\)/);
  assert.match(landingStyles, /\.flow-layout\s*\{[^}]*grid-template-columns: minmax\(0, \.82fr\)[^}]*minmax\(0, 1\.18fr\)/);
  assert.match(landingStyles, /\.flow-agent\s*\{[^}]*min-height: clamp\(58px, 7\.4vh, 72px\)/);
});

test("the three stages share a frame and normalize artwork around the web notebook", () => {
  assert.match(landingStyles, /\.flow-step\s*\{[^}]*height: var\(--stage-height\);[^}]*grid-template-rows: 58px minmax\(0, 1fr\);/);
  assert.match(landingStyles, /\.flow-source-visual\s*\{[^}]*--web-height:/);
  assert.match(landingStyles, /\.flow-owner img\s*\{[^}]*height: calc\(var\(--web-height\) \* \.91\)/);
  assert.match(landingStyles, /\.flow-pdf-card\s*\{[^}]*width: calc\(var\(--web-height\) \* \.781\)/);
  assert.match(landingStyles, /\.flow-pdf-card\s*\{[^}]*height: calc\(var\(--web-height\) \* 1\.186\)/);
  assert.match(landingSource, /className="flow-room-lights"/);
  assert.match(landingStyles, /@keyframes flow-route-pulse/);
  assert.match(landingStyles, /@keyframes flow-agent-scan/);
});

test("the creation action stays at the lower-right and the intake can animate back", () => {
  assert.match(landingSource, /className="flow-enter"/);
  assert.match(landingSource, /setLeaving\(true\)/);
  assert.match(landingSource, /prefers-reduced-motion: reduce/);
  assert.match(landingSource, /window\.setTimeout\(onEnter, reducedMotion \? 0 : 520\)/);
  assert.match(landingStyles, /\.flow-enter\s*\{[^}]*position: fixed;[^}]*right: clamp\([^}]*bottom: clamp\(/);
  assert.match(studioSource, /<ProductFlowLanding onEnter=\{showIntake\} \/>/);
  assert.match(studioSource, /className="intake-back"/);
  assert.match(studioSource, /function returnToStory\(\)/);
  assert.match(landingStyles, /@keyframes intake-enter/);
  assert.match(landingStyles, /@keyframes intake-leave/);
});

test("the landing and intake share one editorial visual system", () => {
  assert.match(studioSource, /intake-wordmark/);
  assert.match(studioSource, /room-logo\.webp/);
  assert.match(studioSource, /从一份经历，/);
  assert.match(studioSource, /className="intake-form-heading"/);
  assert.match(landingStyles, /\.intake-page\s*\{[^}]*--intake-ink: #17202a;[^}]*padding: 0 clamp\(22px, 4vw, 72px\);/);
  assert.match(landingStyles, /\.hero-copy\s*\{[^}]*align-self: start;[^}]*border-top: 1px solid var\(--intake-rule\);/);
  assert.match(landingStyles, /\.hero-copy h1\s*\{[^}]*font-size: clamp\(58px, 5\.45vw, 92px\)/);
  assert.match(landingStyles, /@keyframes intake-copy-rise/);
  assert.match(studioSource, /className="intake-build-preview"/);
  assert.match(landingStyles, /@keyframes intake-preview-scan/);
  assert.match(landingStyles, /\.intake-form\s*\{[^}]*align-self: start;[^}]*border-top: 1px solid rgba\(82, 127, 174, \.46\);/);
  assert.match(landingStyles, /\.demo-panel > button\s*\{[^}]*border-radius: 999px;[^}]*background: #1c3348;/);
});

test("website and resume sources wait for one explicit generate action", () => {
  assert.match(studioSource, /const \[sourceFile, setSourceFile\] = useState<File \| null>\(null\)/);
  assert.match(studioSource, /<form className="intake-form" onSubmit=\{generateFromSources\}>/);
  assert.match(studioSource, /className="intake-generate"/);
  assert.match(studioSource, /disabled=\{loading \|\| !hasSourceInput\}/);
  assert.match(studioSource, /function upload\([\s\S]*setSourceFile\(file\);[\s\S]*确认资料后点击下方生成/);
  assert.doesNotMatch(studioSource, /function upload\([^}]+readFile/);
  assert.match(studioSource, /if \(sourceFile\) \{[\s\S]*readFile\(sourceFile, website \|\| undefined\)/);
  assert.match(studioSource, /if \(website\) form\.set\("website", website\)/);
  assert.match(parseRouteSource, /explicitWebsite[\s\S]*startWebsiteAgent\(explicitWebsite, providerConfig, tracer, signal\)/);
  assert.match(parseRouteSource, /enrichFromWebsite\(profile, file\.name, explicitWebsite, websiteTask, providerConfig, tracer, signal\)/);
  assert.match(studioSource, /parseTextWithAgent\("", value, "url", \[\], value, true\)/);
  assert.doesNotMatch(studioSource.match(/async function extractUrl\(\)[\s\S]*?async function readFile/)?.[0] || "", /\/api\/extract/);
  assert.match(parseRouteSource, /source\.type === "url"[\s\S]*runWebsiteAgent\(startWebsiteAgent\(website, providerConfig, tracer, signal\)/);
});

test("providers without document-block support get line-numbered text evidence instead of page references", () => {
  const textBranch = parseRouteSource.match(/!capabilities\.supportsDocumentBlocks[\s\S]*?\} else \{/)?.[0] || "";
  assert.match(textBranch, /format: "text"/);
  assert.doesNotMatch(textBranch, /format: "pdf"/);
  assert.match(parseRouteSource, /!capabilities\.supportsImageBlocks/);
});

test("conflicting Agent claims stop at an evidence-backed human checkpoint", () => {
  assert.match(parseRouteSource, /mergeProfilesWithReport/);
  assert.match(parseRouteSource, /mergeReport\.reviewRequired/);
  assert.match(studioSource, /<ProfileReviewPanel report=\{profileMergeReport\}/);
  assert.match(studioSource, /resolveProfileMergeReview\(profileMergeReport, resolutions\)/);
  assert.match(reviewSource, /查看证据/);
  assert.match(reviewSource, /我来填写正确值/);
  assert.match(reviewSource, /不公开这个字段/);
});

test("Agent runs expose a modal-opened redacted Trace panel in the creation experience", () => {
  assert.match(studioSource, /<AgentTracePanel events=\{agentRunEvents\}/);
  // The panel is a one-line bar; metrics and the timeline open in a modal so
  // the page never grows or scrolls to accommodate run details.
  assert.match(tracePanelSource, /className=\{`agent-trace-panel/);
  assert.match(tracePanelSource, /agent-detail-backdrop/);
  assert.match(tracePanelSource, /agent-detail-dialog/);
  assert.match(tracePanelSource, /AGENT TRACE \/ LIVE/);
  assert.match(tracePanelSource, /agent-trace-timeline/);
  assert.match(tracePanelSource, /overview\.modelCalls/);
  assert.match(tracePanelSource, /overview\.toolCalls/);
  assert.match(tracePanelSource, /overview\.latencyMs/);
  assert.match(tracePanelSource, /overview\.artifacts/);
  assert.match(tracePanelSource, /overview\.estimatedCost/);
  assert.match(landingStyles, /\.agent-trace-timeline \{[^}]*max-height: 300px;[^}]*overflow-y: auto;/);
  assert.match(landingStyles, /\.agent-detail-dialog \{[^}]*max-height: 84vh;[^}]*overflow-y: auto;/);
});
