import assert from "node:assert/strict";
import test from "node:test";
import { inMemoryTraceStore } from "../../lib/agent-runtime/in-memory-trace-store.ts";
import { createAgentTracer } from "../../lib/agent-runtime/tracer.ts";

test("API keys, authorization headers, cookies, and URL tokens never appear in traces", () => {
  inMemoryTraceStore.clear();
  const tracer = createAgentTracer("security-redaction-run");
  tracer.emit({
    type: "validation.failed",
    step: "security.test",
    errors: [
      "Authorization: Bearer top-secret-bearer",
      "x-api-key=plain-secret-value",
      "https://example.test/?access_token=url-secret-token",
      "cookie: room_session=private-cookie",
    ],
  });
  const serialized = JSON.stringify(tracer.snapshot());
  assert.doesNotMatch(serialized, /top-secret-bearer|plain-secret-value|url-secret-token|private-cookie/);
  assert.match(serialized, /REDACTED/);
});
