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
    return nextResolve(specifier, context);
  },
});

const createRoute = await import(routeUrls.create);
const getRoute = await import(routeUrls.get);
const eventsRoute = await import(routeUrls.events);
const cancelRoute = await import(routeUrls.cancel);
const resumeRoute = await import(routeUrls.resume);

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
  assert.equal(resumed.run.completedNodes.length, 6);

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
