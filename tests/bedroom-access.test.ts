import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roomStudioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("bedroom access exposes separate owner and visitor credentials", () => {
  assert.match(roomStudioSource, /const OWNER_PRIVATE_PASSWORD = "owner2026";/);
  assert.match(roomStudioSource, /const VISITOR_PRIVATE_PASSWORD = "visit2026";/);
  assert.doesNotMatch(roomStudioSource, /const DEMO_PRIVATE_PASSWORD/);
  assert.match(roomStudioSource, /type BedroomAccessMode = "owner" \| "visitor";/);
  assert.match(roomStudioSource, /canEditDiary: true/);
  assert.match(roomStudioSource, /canEditDiary: false/);
});

test("visitor mode cannot reach diary write controls or save handlers", () => {
  assert.match(roomStudioSource, /const diaryWritable = canEditPrivateDiary\(privateUnlockedMode\);/);
  assert.match(roomStudioSource, /if \(!diaryWritable\) \{[\s\S]*setDiaryError\("参观模式只能浏览日记，不能上传图片。"\);/);
  assert.match(roomStudioSource, /if \(!diaryWritable\) \{[\s\S]*setDiaryError\("参观模式只能浏览日记，不能保存新内容。"\);/);
  assert.match(roomStudioSource, /\{diaryWritable \? \([\s\S]*<form className="memory-form" onSubmit=\{saveDiaryEntry\}>/);
  assert.match(roomStudioSource, /当前身份：参观 · 只读浏览 · 本地内容不会上传/);
});

test("leaving private bedroom clears access state before the next entry", () => {
  assert.match(roomStudioSource, /function resetPrivateAccess\(\) \{/);
  assert.match(roomStudioSource, /setPrivateUnlocked\(false\);/);
  assert.match(roomStudioSource, /setPrivateUnlockedMode\(""\);/);
  assert.match(roomStudioSource, /if \(activeRoom === PRIVATE_ROOM_ID\) resetPrivateAccess\(\);/);
  assert.match(roomStudioSource, /私人卧室 · 选择身份/);
});
