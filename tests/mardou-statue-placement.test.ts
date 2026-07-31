import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARDOU_CARTOON_STATUE_PLACEMENT,
  mardouSourcePointToWorld,
} from "../components/MardouMuseumLayout.ts";

const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../components/WorldCanvasPreload.ts", import.meta.url), "utf8");
const loaderSource = await readFile(new URL("../components/SceneAssetLoaders.ts", import.meta.url), "utf8");

test("the supplied cartoon statue is grounded at picked point 10", async () => {
  assert.deepEqual(
    MARDOU_CARTOON_STATUE_PLACEMENT.position,
    mardouSourcePointToWorld([-21.6859, -16.2896, -483.6665]),
  );
  assert.deepEqual(MARDOU_CARTOON_STATUE_PLACEMENT.rotation, [0, 2.1, 0]);
  await access(new URL("../public/vendor/mardou/cartoon-character-statue.glb", import.meta.url));
  assert.match(worldSource, /name="entrance-cartoon-statue"/);
  assert.match(worldSource, /PROJECT_PEDESTAL_SIZE\[1\] \* 3/);
  assert.match(worldSource, /anchor = "bottom"/);
  assert.match(preloadSource, /cartoon-character-statue\.glb/);
  assert.match(loaderSource, /this\.setMeshoptDecoder\(MeshoptDecoder\)/);
});
