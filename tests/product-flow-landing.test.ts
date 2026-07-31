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
