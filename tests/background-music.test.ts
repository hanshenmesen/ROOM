import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BACKGROUND_MUSIC_MAX_VOLUME, BACKGROUND_MUSIC_STORAGE_KEY, normalizeMusicPreference } from "../lib/background-music.ts";

const controllerSource = await readFile(new URL("../components/BackgroundMusicController.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("music preference is local, capped, and defaults to quiet enabled playback", () => {
  assert.equal(BACKGROUND_MUSIC_STORAGE_KEY, "room:background-music:v1");
  assert.equal(BACKGROUND_MUSIC_MAX_VOLUME, 0.18);
  assert.deepEqual(normalizeMusicPreference(null), { muted: false, volume: 0.18 });
  assert.deepEqual(normalizeMusicPreference({ muted: true, volume: 5 }), { muted: true, volume: 0.18 });
});

test("music starts from the enter gesture and never joins the scene loading gate", () => {
  assert.match(studioSource, /void musicController\.current\?\.start\(\)/);
  assert.match(studioSource, /<BackgroundMusicController ref=\{musicController\} enabled=\{sceneReady\}/);
  assert.doesNotMatch(studioSource, /sceneCanReveal[\s\S]{0,180}music/i);
});

test("controller uses procedural Web Audio, visibility pause, and a persistent toggle", () => {
  assert.match(controllerSource, /createOscillator\(\)/);
  assert.match(controllerSource, /visibilitychange/);
  assert.match(controllerSource, /localStorage\.setItem/);
  assert.match(controllerSource, /linearRampToValueAtTime/);
  assert.match(controllerSource, /aria-pressed/);
});
