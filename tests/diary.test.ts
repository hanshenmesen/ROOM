import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_DIARY_ENTRIES,
  MAX_DIARY_TEXT_LENGTH,
  appendDiaryEntry,
  diaryEntryFromDraft,
} from "../lib/diary.ts";

test("a move-in diary entry accepts text, image, or both", () => {
  assert.equal(diaryEntryFromDraft({ id: "empty", text: "  ", createdAt: "now" }), null);
  assert.deepEqual(
    diaryEntryFromDraft({ id: "image", text: "", imageDataUrl: "data:image/png;base64,x", createdAt: "now" }),
    { id: "image", text: "", imageDataUrl: "data:image/png;base64,x", createdAt: "now" },
  );
  assert.equal(
    diaryEntryFromDraft({ id: "text", text: "x".repeat(MAX_DIARY_TEXT_LENGTH + 10), createdAt: "now" })?.text.length,
    MAX_DIARY_TEXT_LENGTH,
  );
});

test("the local diary keeps only the latest bounded entries", () => {
  const entries = Array.from({ length: MAX_DIARY_ENTRIES }, (_, index) => ({
    id: String(index), text: String(index), createdAt: "now",
  }));
  const next = appendDiaryEntry(entries, { id: "latest", text: "latest", createdAt: "now" });
  assert.equal(next.length, MAX_DIARY_ENTRIES);
  assert.equal(next.at(-1)?.id, "latest");
  assert.equal(next[0]?.id, "1");
});

test("the parsing wait screen exposes local text and image capture", () => {
  const source = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /!result && \(loading \|\| pendingProfile\)/);
  assert.match(source, /idPrefix="creation-diary"/);
  assert.match(source, /onImageChange=\{\(event\) => readDiaryImage\(event, true\)\}/);
  assert.match(source, /不会交给 Agent 或上传服务器/);
  assert.match(source, /enterPendingWorld/);
});
