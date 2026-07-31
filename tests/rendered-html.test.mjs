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
  assert.match(html, /<title>ROOM — 把你的经历变成你的世界<\/title>/i);
  assert.match(html, /把你的经历，变成你的世界/);
  assert.match(html, /Agent 理解与编排/);
  assert.match(html, /长成一个人的世界/);
  assert.match(html, /class="flow-step flow-step-source"/);
  assert.match(html, /class="flow-step flow-step-result"/);
  assert.match(html, /开始创建/);
  assert.match(html, /class="flow-enter"/);
  assert.doesNotMatch(html, /blueprint-copy-mask|room-flow-reference|HOW IT WORKS/);
  assert.doesNotMatch(html, /上传你的 CV/);
  assert.doesNotMatch(html, /DEMO · 从简历到博物馆/);
  assert.doesNotMatch(html, /韩晨 的 3D 个人世界/);
  assert.doesNotMatch(html, /林澈/);
  assert.doesNotMatch(html, /产品设计|空间艺术/);
  assert.doesNotMatch(html, /没有简历？直接查看生成结果/);
  assert.doesNotMatch(html, /FOUR AGENTS ONLINE|Agent trace|RAG references/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
