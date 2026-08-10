import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../components/WorldCanvasPreload.ts", import.meta.url), "utf8");
const infoColumn = await readFile(new URL("../public/vendor/mardou/private-info-column.glb", import.meta.url));
const diaryColumn = await readFile(new URL("../public/vendor/mardou/private-diary-column-round.glb", import.meta.url));
const diaryBook = await readFile(new URL("../public/vendor/mardou/private-diary-book.glb", import.meta.url));

test("all non-diary upper-floor information uses the supplied square column and plaque", () => {
  assert.equal(infoColumn.subarray(0, 4).toString("utf8"), "glTF");
  assert.match(worldSource, /PRIVATE_INFO_COLUMN_URL = "\/vendor\/mardou\/private-info-column\.glb"/);
  assert.match(worldSource, /name="private-information-column-display"/);
  assert.match(worldSource, /privatePedestal=\{surfaceRoom === "room-private"\}/);
  assert.match(worldSource, /url=\{PRIVATE_INFO_COLUMN_URL\}/);
  assert.match(worldSource, /<MuseumObjectLabel texture=\{texture\} accent=\{accent\} position=\{\[0, 0\.62, 0\.02\]\}/);
  assert.match(preloadSource, /private-info-column\.glb/);
});

test("the private diary uses the supplied round column and open book", () => {
  assert.equal(diaryColumn.subarray(0, 4).toString("utf8"), "glTF");
  assert.equal(diaryBook.subarray(0, 4).toString("utf8"), "glTF");
  assert.match(worldSource, /name="private-diary-column-and-book"/);
  assert.match(worldSource, /url=\{PRIVATE_DIARY_COLUMN_URL\} targetSize=\{PRIVATE_DIARY_COLUMN_SIZE\}/);
  assert.match(worldSource, /url=\{PRIVATE_DIARY_BOOK_URL\}/);
  assert.match(worldSource, /anchorY=\{PRIVATE_DIARY_COLUMN_SIZE\[1\]\}/);
  assert.match(preloadSource, /private-diary-column-round\.glb/);
  assert.match(preloadSource, /private-diary-book\.glb/);
});
