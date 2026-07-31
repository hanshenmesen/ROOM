import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_HIDDEN_MESH_NAMES, MARDOU_PICTURE_SLOTS } from "../components/MardouMuseumLayout.ts";

const sceneSource = await readFile(new URL("../components/MardouMuseumScene.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("authored Picture and Bix meshes remain in the GLB but leave the runtime clone", () => {
  assert.deepEqual(
    MARDOU_PICTURE_SLOTS.map((slot) => ({ name: slot.name, visible: slot.defaultVisible })),
    [
      { name: "Picture", visible: false },
      { name: "Picture_1", visible: false },
      { name: "Picture_2", visible: false },
    ],
  );
  assert.deepEqual(MARDOU_HIDDEN_MESH_NAMES, [
    "Picture",
    "Picture_1",
    "Picture_2",
    "bix_body",
    "bix_eye_upper",
    "Bix_Hair",
    "bix_eye_lower",
  ]);
  assert.match(sceneSource, /MARDOU_HIDDEN_MESH_NAMES[\s\S]*includes\(object\.name\)[\s\S]*hiddenMeshes\.push\(object\)/);
  assert.match(sceneSource, /hiddenMeshes\.forEach\(\(object\) => object\.removeFromParent\(\)\)/);
});

test("the hidden Picture meshes and project paging no longer expose top navigation controls", () => {
  assert.equal(MARDOU_PICTURE_SLOTS.some((slot) => slot.replaceable), false);
  assert.doesNotMatch(studioSource, /配置 GLB 图片位/);
  assert.doesNotMatch(studioSource, /上一组项目/);
  assert.doesNotMatch(studioSource, /下一组项目/);
  assert.doesNotMatch(sceneSource, /SceneTextureLoader/);
});

test("the fictional demo ships three frame images and preserves their full aspect ratio", () => {
  assert.match(studioSource, /frame-xhs-lobby\.jpg/);
  assert.match(studioSource, /frame-buildathon-workspace\.jpg/);
  assert.match(studioSource, /frame-buildathon-camp\.jpg/);
  assert.match(studioSource, /displayedPrivateFrameImages/);
});
