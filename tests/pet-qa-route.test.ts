import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ParsedProfile } from "../lib/types.ts";

const ROUTE_URL = new URL("../app/api/pet-qa/route.ts", import.meta.url).href;
const PET_QA_URL = new URL("../lib/agents/pet-qa.ts", import.meta.url).href;
const PROVIDER_CONFIG_URL = new URL("../lib/agents/provider-config.ts", import.meta.url).href;
const BROWSER_CONFIG_URL = new URL("../lib/browser-agent-config.ts", import.meta.url).href;
const PUBLIC_WEB_URL = new URL("../lib/public-web.ts", import.meta.url).href;
const TYPES_URL = new URL("../lib/types.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/agents/pet-qa") return { url: PET_QA_URL, shortCircuit: true };
    if (specifier === "@/lib/agents/provider-config") return { url: PROVIDER_CONFIG_URL, shortCircuit: true };
    if (specifier === "@/lib/browser-agent-config") return { url: BROWSER_CONFIG_URL, shortCircuit: true };
    if (specifier === "@/lib/public-web") return { url: PUBLIC_WEB_URL, shortCircuit: true };
    if (specifier === "@/lib/types") return { url: TYPES_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if ([ROUTE_URL, PET_QA_URL, PROVIDER_CONFIG_URL, BROWSER_CONFIG_URL, PUBLIC_WEB_URL, TYPES_URL].includes(url)) {
      return {
        format: "module",
        shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "strip" }),
      };
    }
    return nextLoad(url, context);
  },
});

const { POST } = await import(ROUTE_URL);
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  petKey: process.env.PET_QA_API_KEY,
  maasKey: process.env.MAAS_API_KEY,
};

const profile: ParsedProfile = {
  id: "profile-1",
  name: "韩晨",
  headline: "LLM-Agent 实习生",
  summary: "研究多智能体与可信信息系统。",
  contacts: [],
  skills: [],
  media: [],
  identityEvidence: {},
  contactEvidence: {},
  skillEvidence: {},
  items: [{
    id: "project-1",
    kind: "project",
    title: "Project",
    summary: "项目摘要",
    bullets: [],
    tags: [],
    evidence: [{ sourceId: "resume", locator: "line:1", excerpt: "项目摘要" }],
  }],
  source: { id: "resume", type: "text", label: "resume", lineCount: 1 },
};

function qaRequest(headers?: HeadersInit, body: unknown = { profile, question: "项目是什么？" }) {
  return new Request("https://room.test/api/pet-qa", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_ENV.petKey === undefined) delete process.env.PET_QA_API_KEY;
  else process.env.PET_QA_API_KEY = ORIGINAL_ENV.petKey;
  if (ORIGINAL_ENV.maasKey === undefined) delete process.env.MAAS_API_KEY;
  else process.env.MAAS_API_KEY = ORIGINAL_ENV.maasKey;
});

test("pet QA route uses browser-session provider settings without exposing keys", async () => {
  process.env.PET_QA_API_KEY = "server-pet-key";
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://browser-pet.example.test/v1/messages");
    authorization = new Headers(init?.headers).get("authorization") || "";
    return Response.json({
      content: [{
        type: "text",
        text: JSON.stringify({
          answer: "资料显示项目摘要。",
          citations: [{ itemId: "project-1", title: "Project", excerpt: "项目摘要" }],
        }),
      }],
    });
  }) as typeof fetch;

  const response = await POST(qaRequest({
    "x-room-pet-qa-api-key": "browser-pet-key",
    "x-room-pet-qa-base-url": "https://browser-pet.example.test/v1",
    "x-room-pet-qa-model": "browser-model",
  }));
  const payload = await response.json() as { answer: string; citations: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.answer, "资料显示项目摘要。");
  assert.equal(payload.citations.length, 1);
  assert.equal(authorization, "Bearer browser-pet-key");
});

test("pet QA route rejects private browser-session provider before calling it", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({});
  }) as typeof fetch;

  const response = await POST(qaRequest({
    "x-room-pet-qa-api-key": "browser-pet-key",
    "x-room-pet-qa-base-url": "https://localhost/v1",
    "x-room-pet-qa-model": "browser-model",
  }));
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "宠物 QA Base URL 必须是公开的 HTTPS 地址。");
  assert.equal(calls, 0);
});

test("pet QA route returns a recoverable 400 when profile is missing", async () => {
  const response = await POST(qaRequest(undefined, { question: "项目是什么？" }));
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "缺少可用于回答的公开 Profile。");
});
