import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { inMemoryWorkflowStore } from "../lib/workflow/in-memory-workflow-store.ts";

const routeUrls = {
  create: new URL("../app/api/runs/route.ts", import.meta.url).href,
  get: new URL("../app/api/runs/[runId]/route.ts", import.meta.url).href,
  events: new URL("../app/api/runs/[runId]/events/route.ts", import.meta.url).href,
  cancel: new URL("../app/api/runs/[runId]/cancel/route.ts", import.meta.url).href,
  resume: new URL("../app/api/runs/[runId]/resume/route.ts", import.meta.url).href,
  review: new URL("../app/api/runs/[runId]/review/route.ts", import.meta.url).href,
};

const workflowAliases: Record<string, string> = {
  "@/lib/workflow/public-snapshot": new URL("../lib/workflow/public-snapshot.ts", import.meta.url).href,
  "@/lib/workflow/room-workflow": new URL("../lib/workflow/room-workflow.ts", import.meta.url).href,
  "@/lib/workflow/singleton": new URL("../lib/workflow/singleton.ts", import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (workflowAliases[specifier]) return { url: workflowAliases[specifier], shortCircuit: true };
    if (specifier.startsWith("@/lib/")) {
      return { url: new URL(`../lib/${specifier.slice("@/lib/".length)}.ts`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const createRoute = await import(routeUrls.create);
const getRoute = await import(routeUrls.get);
const eventsRoute = await import(routeUrls.events);
const cancelRoute = await import(routeUrls.cancel);
const resumeRoute = await import(routeUrls.resume);
const reviewRoute = await import(routeUrls.review);

function context(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

function createRequest(text: string, key = "workflow-route-key-0001", autoStart = false) {
  return new Request("https://room.test/api/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({
      source: { type: "text", label: "Route fixture", text },
      autoStart,
    }),
  });
}

test.beforeEach(async () => {
  await inMemoryWorkflowStore.clear();
});

test("Workflow routes create, deduplicate, resume, query and cursor events without exposing source text", async () => {
  const privateSource = "Route Person\nEngineer\nPRIVATE-WORKFLOW-SOURCE";
  const createdResponse = await createRoute.POST(createRequest(privateSource));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { reused: boolean; run: { runId: string; status: string } };
  assert.equal(created.reused, false);
  assert.equal(created.run.status, "queued");
  assert.doesNotMatch(JSON.stringify(created), /PRIVATE-WORKFLOW-SOURCE/);

  const repeatedResponse = await createRoute.POST(createRequest(privateSource));
  assert.equal(repeatedResponse.status, 200);
  const repeated = await repeatedResponse.json() as typeof created;
  assert.equal(repeated.reused, true);
  assert.equal(repeated.run.runId, created.run.runId);

  const initialEventsResponse = await eventsRoute.GET(
    new Request(`https://room.test/api/runs/${created.run.runId}/events?after=0`),
    context(created.run.runId),
  );
  const initialEvents = await initialEventsResponse.json() as { events: Array<{ sequence: number; type: string }>; nextSequence: number };
  assert.deepEqual(initialEvents.events.map((event) => event.type), ["run.queued"]);
  assert.equal(initialEvents.nextSequence, 1);

  const resumedResponse = await resumeRoute.POST(
    new Request(`https://room.test/api/runs/${created.run.runId}/resume`, { method: "POST" }),
    context(created.run.runId),
  );
  assert.equal(resumedResponse.status, 200);
  const resumed = await resumedResponse.json() as { run: { status: string; completedNodes: string[] } };
  assert.equal(resumed.run.status, "completed");
  assert.equal(resumed.run.completedNodes.length, 10);

  const stateResponse = await getRoute.GET(
    new Request(`https://room.test/api/runs/${created.run.runId}`),
    context(created.run.runId),
  );
  assert.equal(stateResponse.status, 200);
  const stateText = await stateResponse.text();
  assert.doesNotMatch(stateText, /PRIVATE-WORKFLOW-SOURCE/);
  assert.match(stateText, /check-report\.v1/);

  const laterEventsResponse = await eventsRoute.GET(
    new Request(`https://room.test/api/runs/${created.run.runId}/events?after=1`),
    context(created.run.runId),
  );
  const laterEvents = await laterEventsResponse.json() as { events: Array<{ sequence: number; type: string }> };
  assert.ok(laterEvents.events.length > 1);
  assert.ok(laterEvents.events.every((event) => event.sequence > 1));
  assert.equal(laterEvents.events.at(-1)?.type, "run.completed");
});

test("Workflow routes reject conflicting Idempotency Keys and terminal cancellation", async () => {
  const firstResponse = await createRoute.POST(createRequest("First\nEngineer", "workflow-route-key-0002", true));
  const first = await firstResponse.json() as { run: { runId: string; status: string } };
  assert.equal(first.run.status, "completed");

  const conflict = await createRoute.POST(createRequest("Different\nEngineer", "workflow-route-key-0002", false));
  assert.equal(conflict.status, 409);

  const cancellation = await cancelRoute.POST(
    new Request(`https://room.test/api/runs/${first.run.runId}/cancel`, { method: "POST" }),
    context(first.run.runId),
  );
  assert.equal(cancellation.status, 409);
});

test("Workflow cancellation keeps queued work terminal and visible", async () => {
  const createdResponse = await createRoute.POST(createRequest("Queued\nEngineer", "workflow-route-key-0003", false));
  const created = await createdResponse.json() as { run: { runId: string } };
  const cancellation = await cancelRoute.POST(
    new Request(`https://room.test/api/runs/${created.run.runId}/cancel`, { method: "POST" }),
    context(created.run.runId),
  );
  assert.equal(cancellation.status, 200);
  const cancelled = await cancellation.json() as { run: { status: string } };
  assert.equal(cancelled.run.status, "cancelled");
  const resume = await resumeRoute.POST(
    new Request(`https://room.test/api/runs/${created.run.runId}/resume`, { method: "POST" }),
    context(created.run.runId),
  );
  assert.equal(resume.status, 409);
});

test("Workflow review route validates decisions and rejects Runs that are not waiting", async () => {
  const createdResponse = await createRoute.POST(createRequest("Review route\nEngineer", "workflow-route-key-0004", false));
  const created = await createdResponse.json() as { run: { runId: string } };
  const invalid = await reviewRoute.POST(
    new Request(`https://room.test/api/runs/${created.run.runId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolutions: [] }),
    }),
    context(created.run.runId),
  );
  assert.equal(invalid.status, 400);
  const notWaiting = await reviewRoute.POST(
    new Request(`https://room.test/api/runs/${created.run.runId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolutions: [{ conflictId: "conflict-profile-headline", action: "primary" }] }),
    }),
    context(created.run.runId),
  );
  assert.equal(notWaiting.status, 409);
});

test("Workflow create route runs the checkpointed online Agent path for text sources", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const originalBaseUrl = process.env.MAAS_BASE_URL;
  const originalModel = process.env.MAAS_MODEL;
  process.env.MAAS_API_KEY = "workflow-route-agent-key";
  process.env.MAAS_BASE_URL = "https://external-maas.example/hackson";
  process.env.MAAS_MODEL = "vertex-claude/claude";
  const identity = {
    sourcePageCount: null, personalWebsite: null,
    identity: {
      name: { value: "林遥", evidenceLines: [1], evidenceExcerpt: "林遥" },
      headline: { value: "交互设计师", evidenceLines: [2], evidenceExcerpt: "交互设计师" },
      location: null,
      summary: { value: "设计数字空间。", evidenceLines: [3], evidenceExcerpt: "设计数字空间。" },
    },
    contacts: [], foods: [], hobbies: [], skills: [],
  };
  const inventory = {
    sourcePageCount: null,
    items: [{
      kind: "project", contentFamily: null, title: "ROOM", subtitle: null, detail: "ROOM",
      bullets: [], tags: [], timeRange: null, role: null, techStack: [], projectUrl: null,
      fieldEvidence: {}, sourceUrl: null, mediaIndex: null, evidenceLines: [4], evidenceExcerpt: "ROOM",
    }],
  };
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { output_config: { format: { schema: { properties: Record<string, unknown> } } } };
    const output = body.output_config.format.schema.properties.identity ? identity : inventory;
    return Response.json({ content: [{ type: "text", text: JSON.stringify(output) }] });
  }) as typeof fetch;
  try {
    const response = await createRoute.POST(new Request("https://room.test/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "workflow-agent-route-0001" },
      body: JSON.stringify({
        source: { type: "text", label: "Agent fixture", text: "林遥\n交互设计师\n设计数字空间。\nROOM" },
        mode: "agent",
        followWebsite: false,
        autoStart: true,
      }),
    }));
    assert.equal(response.status, 201);
    const body = await response.json() as {
      run: { status: string; completedNodes: string[] };
      result?: { profile?: { name: string } };
    };
    assert.equal(body.run.status, "completed");
    assert.ok(body.run.completedNodes.includes("extract_identity"));
    assert.ok(body.run.completedNodes.includes("extract_inventory"));
    assert.equal(body.result?.profile?.name, "林遥");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY; else process.env.MAAS_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.MAAS_BASE_URL; else process.env.MAAS_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.MAAS_MODEL; else process.env.MAAS_MODEL = originalModel;
  }
});

test("Workflow create route rejects a non-public URL source before Agent execution", async () => {
  const response = await createRoute.POST(new Request("https://room.test/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: { type: "url", label: "Local portfolio", text: "http://127.0.0.1/private" },
      mode: "agent",
    }),
  }));
  assert.equal(response.status, 400);
});
