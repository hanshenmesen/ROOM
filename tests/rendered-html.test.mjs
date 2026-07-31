import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders ROOM product shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>ROOM — 把你的经历变成一个世界<\/title>/i);
  assert.match(html, /把你的经历/);
  assert.match(html, /上传你的 CV/);
  assert.match(html, /https:\/\/yourname\.com/);
  assert.match(html, /DEMO · 从简历到别墅/);
  assert.match(html, /示例数据，仅用于快速体验/);
  assert.match(html, /示例人物/);
  assert.match(html, /进入示例别墅/);
  assert.doesNotMatch(html, /林澈/);
  assert.doesNotMatch(html, /产品设计|空间艺术/);
  assert.doesNotMatch(html, /没有简历？直接查看生成结果/);
  assert.doesNotMatch(html, /FOUR AGENTS ONLINE|Agent trace|RAG references/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
