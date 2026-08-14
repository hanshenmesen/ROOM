import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBrandedId,
  newArtifactId,
  newCallId,
  newCheckpointId,
  newEventId,
  newRunId,
  newToolCallId,
  newWorkflowEventId,
  newWorkflowRunId,
} from "../lib/ids.ts";

test("ID factories produce distinct, correctly-prefixed, unique values", () => {
  const cases: Array<[() => string, string]> = [
    [newRunId, "run"],
    [newEventId, "event"],
    [newWorkflowRunId, "workflow"],
    [newWorkflowEventId, "workflow-event"],
    [newCheckpointId, "checkpoint"],
    [newArtifactId, "artifact"],
    [newToolCallId, "tool-call"],
    [newCallId, "call"],
  ];
  for (const [factory, prefix] of cases) {
    const first = factory();
    const second = factory();
    assert.ok(first.startsWith(`${prefix}-`), `${first} should start with "${prefix}-"`);
    assert.notEqual(first, second, "two calls must not collide");
  }
});

test("newWorkflowRunId and newRunId never share a prefix (two independent Run-ID namespaces)", () => {
  assert.ok(!newWorkflowRunId().startsWith("run-"));
  assert.ok(!newRunId().startsWith("workflow-"));
});

test("assertBrandedId accepts a matching prefix and rejects a mismatched one", () => {
  const runId = newWorkflowRunId();
  assert.equal(assertBrandedId(runId, "workflow", "WorkflowRunId"), runId);
  assert.throws(() => assertBrandedId(runId, "run", "RunId"));
});
