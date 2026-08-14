import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentBudgetExceededError,
  AgentRunControls,
  DEFAULT_AGENT_RUN_BUDGET,
  PROFILE_AGENT_LEASE_TTL_MS,
  PROFILE_AGENT_REQUEST_TIMEOUT_MS,
  PROFILE_AGENT_RUN_GRACE_MS,
  PROFILE_AGENT_RUN_TIMEOUT_MS,
} from "../lib/agent-runtime/run-controls.ts";

test("Profile Agent timeout, Run budget, and concurrency lease preserve one ordering invariant", () => {
  assert.equal(DEFAULT_AGENT_RUN_BUDGET.maxDurationMs, PROFILE_AGENT_RUN_TIMEOUT_MS);
  assert.ok(PROFILE_AGENT_REQUEST_TIMEOUT_MS < PROFILE_AGENT_RUN_TIMEOUT_MS);
  assert.equal(PROFILE_AGENT_LEASE_TTL_MS, PROFILE_AGENT_RUN_TIMEOUT_MS + PROFILE_AGENT_RUN_GRACE_MS);
  assert.ok(PROFILE_AGENT_LEASE_TTL_MS > DEFAULT_AGENT_RUN_BUDGET.maxDurationMs);
});

test("a provider request cannot start after the persisted Run duration budget is exhausted", () => {
  const controls = new AgentRunControls({
    budget: { maxDurationMs: 1_000 },
    initialUsage: { elapsedMs: 1_000 },
  });
  assert.throws(() => controls.requestSignal(PROFILE_AGENT_REQUEST_TIMEOUT_MS), (error) => (
    error instanceof AgentBudgetExceededError && error.reason === "duration"
  ));
});
