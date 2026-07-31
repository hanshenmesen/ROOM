import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const design = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("world opening replaces a source portrait before compiling the visible scene", () => {
  assert.match(source, /profileWithPortraitUrl\(editedProfile, abstractPortraitPlaceholder\(\)\)/);
  assert.match(source, /const next = compileProfile\(displayProfile\)/);
  assert.match(source, /if \(sourcePortrait\) void generateAbstractPortrait\(sourcePortrait, next\.profile\)/);
});

test("scene reveal waits for automatic abstract portrait generation to settle", () => {
  assert.match(source, /sceneCommitted && sceneResourcesReady && portraitGenerationSettled/);
  assert.match(source, /正在创作抽象肖像，真人照片不会出现在展厅/);
});

test("portrait detail exposes only abstract art and a retry action", () => {
  assert.match(source, /AI ABSTRACT ART · ALWAYS ON/);
  assert.match(source, /展厅只展示抽象画/);
  assert.match(source, /重试生成/);
  assert.doesNotMatch(source, /applyPortraitMode|选择头像表现方式|已恢复展示解析得到的原始照片/);
});

test("intake discloses automatic photo transformation", () => {
  assert.match(source, /自动把它发送至图像服务生成抽象肖像/);
  assert.match(design, /source photo is an identity input, never a public exhibit/i);
});

test("multipart runtime limit remains just above the route's explicit image limit", () => {
  assert.match(nextConfig, /bodySizeLimit: "9mb"/);
});

test("local Cloudflare runtime receives image-provider settings", () => {
  assert.match(viteConfig, /IMAGE_MAAS_API_KEY/);
  assert.match(viteConfig, /IMAGE_MAAS_BASE_URL/);
  assert.match(viteConfig, /IMAGE_MAAS_MODEL/);
});
