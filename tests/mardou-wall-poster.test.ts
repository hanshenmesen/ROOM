import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutSource = await readFile(new URL("../components/MardouMuseumLayout.ts", import.meta.url), "utf8");
const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../components/WorldCanvasPreload.ts", import.meta.url), "utf8");

test("the removed Buildathon wall image is neither mounted nor preloaded", () => {
  assert.doesNotMatch(layoutSource, /MARDOU_BUILDATHON_POSTER_PLACEMENT/);
  assert.doesNotMatch(worldSource, /BuildathonWallPoster|buildathon-wall-poster/);
  assert.doesNotMatch(preloadSource, /buildathon-wall-poster/);
});
