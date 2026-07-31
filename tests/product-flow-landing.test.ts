import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingSource = readFileSync(new URL("../components/ProductFlowLanding.tsx", import.meta.url), "utf8");
const landingStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("the landing is rebuilt from independently positioned PPT artwork", () => {
  for (const asset of [
    "room-logo.png",
    "owner.png",
    "resume-paper.png",
    "web-profile.png",
    "agent-parser.png",
    "agent-director.png",
    "agent-orchestrator.png",
    "agent-checker.png",
    "house.png",
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
  assert.match(landingSource, /window\.setTimeout\(onEnter, 520\)/);
  assert.match(landingStyles, /\.flow-enter\s*\{[^}]*position: fixed;[^}]*right: clamp\([^}]*bottom: clamp\(/);
  assert.match(studioSource, /<ProductFlowLanding onEnter=\{showIntake\} \/>/);
  assert.match(studioSource, /className="intake-back"/);
  assert.match(studioSource, /function returnToStory\(\)/);
  assert.match(landingStyles, /@keyframes intake-enter/);
  assert.match(landingStyles, /@keyframes intake-leave/);
});

test("the landing and intake share one editorial visual system", () => {
  assert.match(studioSource, /intake-wordmark/);
  assert.match(studioSource, /room-logo\.png/);
  assert.match(studioSource, /从一份经历，/);
  assert.match(studioSource, /className="intake-form-heading"/);
  assert.match(landingStyles, /\.intake-page\s*\{[^}]*--intake-ink: #17202a;[^}]*padding: 0 clamp\(22px, 4vw, 72px\);/);
  assert.match(landingStyles, /\.hero-copy\s*\{[^}]*align-self: start;[^}]*border-top: 1px solid var\(--intake-rule\);/);
  assert.match(landingStyles, /\.hero-copy h1\s*\{[^}]*font-size: clamp\(48px, 4\.6vw, 76px\)/);
  assert.match(landingStyles, /@keyframes intake-copy-rise/);
  assert.match(landingStyles, /\.intake-form\s*\{[^}]*align-self: start;[^}]*border-top: 1px solid rgba\(82, 127, 174, \.46\);/);
  assert.match(landingStyles, /\.demo-panel > button\s*\{[^}]*border-radius: 999px;[^}]*background: #1c3348;/);
});
