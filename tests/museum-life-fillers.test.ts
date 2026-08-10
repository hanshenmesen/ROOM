import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_LIFE_FILLER_PLACEMENTS } from "../components/MardouMuseumLayout.ts";

const source = await readFile(new URL("../components/MuseumLifeFillers.tsx", import.meta.url), "utf8");
const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("lobby life zones expose interactive hobbies and imported food assets", () => {
  assert.match(source, /name="sports-life-display"/);
  assert.match(source, /pattern="basketball"/);
  assert.match(source, /pattern="football"/);
  assert.match(source, /pattern="tennis"/);
  assert.match(source, /setFromUnitVectors/);
  assert.match(source, /name="refreshment-life-display"/);
  assert.match(source, /fruit-collection\.glb/);
  assert.match(source, /drink-1\.glb/);
  assert.match(source, /showroom-hobbies/);
  assert.match(source, /showroom-snacks/);
  assert.match(studioSource, /eyebrow: "FOOD"/);
  assert.match(studioSource, /title: "食物"/);
  assert.doesNotMatch(studioSource, /爱吃的零食|FAVORITE SNACKS/);
  assert.match(worldSource, /<MuseumLifeFillers[\s\S]{0,180}selectedId=\{selectedExhibit \|\| ""\}/);
  assert.ok(MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[0] > 5);
  assert.ok(MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[2] <= -14.2);
  assert.deepEqual(
    MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position,
    [-6.445160057855965, 0.24609656051061357, -13.294641191197513],
  );
});

test("the guestbook wall frame shares the guestbook action and clips scrolling messages inside the frame", () => {
  assert.match(worldSource, /name="guestbook-wall-frame"/);
  assert.match(worldSource, /animatedGuestbookBorder: true/);
  assert.match(worldSource, /function GuestbookMessageTicker/);
  assert.match(worldSource, /context\.rect\(42, 190, 940, 326\)/);
  assert.match(worldSource, /context\.clip\(\)/);
  assert.match(worldSource, /messages\.slice\(-10\)/);
  assert.match(worldSource, /guestbookTicker: true/);
  assert.doesNotMatch(worldSource, /FloatingGuestbookMessage/);
  assert.match(worldSource, /onSelect=\{\(\) => onSelect\("showroom-guestbook"\)\}/);
  assert.doesNotMatch(worldSource, /GuestbookBoard/);
  assert.doesNotMatch(worldSource, /MARDOU_GUESTBOOK_PLACEMENT/);
});

test("the mistakenly added exterior glass facade is no longer mounted", () => {
  assert.doesNotMatch(worldSource, /MardouExteriorGlassFacade/);
});
