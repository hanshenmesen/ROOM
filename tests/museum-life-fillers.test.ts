import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_LIFE_FILLER_PLACEMENTS } from "../components/MardouMuseumLayout.ts";

const source = await readFile(new URL("../components/MuseumLifeFillers.tsx", import.meta.url), "utf8");
const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("empty lobby zones receive sports, food, and drink model clusters", () => {
  assert.match(source, /name="sports-life-display"/);
  assert.match(source, /pattern="basketball"/);
  assert.match(source, /pattern="football"/);
  assert.match(source, /pattern="tennis"/);
  assert.match(source, /setFromUnitVectors/);
  assert.match(source, /name="refreshment-life-display"/);
  assert.match(source, /function Cup/);
  assert.match(worldSource, /<MuseumLifeFillers visible=\{activeRoom === "room-lobby"\}/);
  assert.ok(MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[0] > 5);
  assert.ok(MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[2] <= -14.2);
  assert.ok(MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[0] < -6);
  assert.equal(MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[2], -13.5);
});

test("the mistakenly added exterior glass facade is no longer mounted", () => {
  assert.doesNotMatch(worldSource, /MardouExteriorGlassFacade/);
});
