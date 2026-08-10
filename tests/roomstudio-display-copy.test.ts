import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("public exhibit details never render evidence locators as presentation copy", () => {
  assert.doesNotMatch(studioSource, /证据定位|来源定位|逐项来源定位/);
  assert.doesNotMatch(studioSource, /\.locator/);
  assert.match(studioSource, /sanitizeDisplayText/);
  assert.match(studioSource, /完整资料保留/);
});
