import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/ExhibitFocusScreen.tsx", import.meta.url), "utf8");

test("exhibit focus screen exposes the immersive center-screen contract", () => {
  assert.match(source, /export type ExhibitFocusScreenProps/);
  assert.match(source, /title: string/);
  assert.match(source, /exhibitType: string/);
  assert.match(source, /body\?: string/);
  assert.match(source, /bullets\?: string\[\]/);
  assert.match(source, /image\?: ExhibitFocusImage/);
  assert.match(source, /sourceLinks\?: ExhibitFocusSourceLink\[\]/);
  assert.match(source, /onPrevious\?: \(\) => void/);
  assert.match(source, /onNext\?: \(\) => void/);
  assert.match(source, /projectEditSlot\?: ReactNode/);
  assert.match(source, /portraitRegenerateSlot\?: ReactNode/);
});

test("exhibit focus screen is accessible as a modal dialog", () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /previouslyFocusedRef\.current\?\.focus\(\)/);
});

test("exhibit focus screen supports close, escape, backdrop, and tab focus trap", () => {
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onClose\(\)/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /last\.focus\(\)/);
  assert.match(source, /first\.focus\(\)/);
  assert.match(source, /event\.target === event\.currentTarget/);
});

test("exhibit focus screen supports exhibit navigation and source links", () => {
  assert.match(source, /当前展台位置/);
  assert.match(source, /上一个展台/);
  assert.match(source, /下一个展台/);
  assert.match(source, /aria-label="展台来源链接"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
});
