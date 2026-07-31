import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { access } from "node:fs/promises";
import { BACKGROUND_MUSIC_MAX_VOLUME, BACKGROUND_MUSIC_STORAGE_KEY, DEFAULT_MUSIC_BOX_TRACK, MUSIC_BOX_TRACKS, clampMediaVolume, normalizeMusicPreference } from "../lib/background-music.ts";

const controllerSource = await readFile(new URL("../components/BackgroundMusicController.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("music preference is local, capped, and defaults to quiet enabled playback", () => {
  assert.equal(BACKGROUND_MUSIC_STORAGE_KEY, "room:background-music:v1");
  assert.equal(BACKGROUND_MUSIC_MAX_VOLUME, 0.18);
  assert.deepEqual(normalizeMusicPreference(null), { muted: false, volume: 0.18 });
  assert.deepEqual(normalizeMusicPreference({ muted: true, volume: 5 }), { muted: true, volume: 0.18 });
  assert.equal(clampMediaVolume(-0.00009), 0);
  assert.equal(clampMediaVolume(1.00009), 1);
});

test("music starts from the enter gesture and never joins the scene loading gate", () => {
  assert.match(studioSource, /void musicController\.current\?\.start\(\)/);
  assert.match(studioSource, /<BackgroundMusicController ref=\{musicController\} enabled=\{sceneReady\}/);
  assert.doesNotMatch(studioSource, /sceneCanReveal[\s\S]{0,180}music/i);
});

test("controller uses a real bundled music track, visibility pause, and a persistent toggle", () => {
  assert.match(controllerSource, /new Audio\(DEFAULT_MUSIC_BOX_TRACK\.src\)/);
  assert.doesNotMatch(controllerSource, /createOscillator\(\)/);
  assert.match(controllerSource, /visibilitychange/);
  assert.match(controllerSource, /localStorage\.setItem/);
  assert.match(controllerSource, /requestAnimationFrame/);
  assert.match(controllerSource, /Math\.max\(0, Math\.min\(1,/);
  assert.match(controllerSource, /audio\.volume = clampMediaVolume/);
  assert.match(controllerSource, /aria-pressed/);
  assert.match(controllerSource, /else if \(!muted\) void start\(\)/);
  assert.match(controllerSource, /function togglePlayback\(\)/);
  assert.match(controllerSource, /const nextMuted = !muted && started/);
  assert.match(controllerSource, /if \(!nextMuted\) void start\(\)/);
  assert.match(controllerSource, /"已关闭音乐" : "已开启音乐"/);
  assert.doesNotMatch(controllerSource, /started \? DEFAULT_MUSIC_BOX_TRACK\.title/);
});

test("the local gramophone yields to and restores the ambient controller", () => {
  assert.match(studioSource, /musicController\.current\?\.stop\(\);[\s\S]{0,100}await audio\.play\(\)/);
  assert.match(studioSource, /audio\.pause\(\);[\s\S]{0,100}musicController\.current\?\.start\(\)/);
  assert.match(studioSource, /onEnded=\{\(\) => \{[\s\S]{0,120}musicController\.current\?\.start\(\)/);
});

test("the gramophone ships three local CC0 tracks and supports switching them", async () => {
  assert.equal(MUSIC_BOX_TRACKS.length, 3);
  assert.equal(DEFAULT_MUSIC_BOX_TRACK, MUSIC_BOX_TRACKS[0]);
  assert.equal(new Set(MUSIC_BOX_TRACKS.map((track) => track.id)).size, 3);
  assert.equal(MUSIC_BOX_TRACKS.every((track) => track.license === "CC0 1.0"), true);
  for (const track of MUSIC_BOX_TRACKS) {
    await access(new URL(`../public${track.src}`, import.meta.url));
  }
  assert.match(studioSource, /MUSIC_BOX_TRACKS\.map/);
  assert.match(studioSource, /selectBundledMusic/);
  assert.match(studioSource, /preload="metadata"/);
});
