import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_PICTURE_SLOTS } from "../components/MardouMuseumLayout.ts";

const sceneSource = await readFile(new URL("../components/MardouMuseumScene.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("Picture_1 remains in the GLB scene but defaults to hidden", () => {
  assert.deepEqual(MARDOU_PICTURE_SLOTS.find((slot) => slot.name === "Picture_1"), {
    name: "Picture_1",
    defaultVisible: false,
    replaceable: false,
  });
  assert.match(sceneSource, /object\.visible = pictureSlot\.defaultVisible/);
  assert.doesNotMatch(sceneSource, /remove\([^)]*Picture_1/);
});

test("Picture and Picture_2 expose independent URL and file replacement controls", () => {
  assert.equal(MARDOU_PICTURE_SLOTS.filter((slot) => slot.replaceable).length, 2);
  assert.match(studioSource, /EDITABLE_PICTURE_SLOTS = \["Picture", "Picture_2"\]/);
  assert.match(studioSource, /应用 URL/);
  assert.match(studioSource, /选择本地图片/);
  assert.match(sceneSource, /loadedTextures\.forEach\(\(texture\) => texture\.dispose\(\)\)/);
});
