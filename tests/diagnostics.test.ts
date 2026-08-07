import assert from "node:assert/strict";
import test from "node:test";
import {
  diagnosticDump,
  diagnosticPayloadsEnabled,
  summarizeDiagnosticValue,
} from "../lib/agent-runtime/diagnostics.ts";
import { redactTraceValue } from "../lib/agent-runtime/redaction.ts";
import { createAgentTracer } from "../lib/agent-runtime/tracer.ts";
import { traceEventMetadata } from "../lib/agent-runtime/trace-inspector.ts";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";
// Internal gateway identifiers are injected via env; tests use placeholders.
process.env.INTERNAL_MAAS_HOST = "internal-maas.example";
process.env.INTERNAL_MAAS_APP_ID = "test-app-id";


const PII_SAMPLE = "上海交通大学";

function withPayloadFlag<T>(value: string | undefined, run: () => T): T {
  const original = process.env.AGENT_DIAGNOSTIC_PAYLOADS;
  if (value === undefined) delete process.env.AGENT_DIAGNOSTIC_PAYLOADS;
  else process.env.AGENT_DIAGNOSTIC_PAYLOADS = value;
  try {
    return run();
  } finally {
    if (original === undefined) delete process.env.AGENT_DIAGNOSTIC_PAYLOADS;
    else process.env.AGENT_DIAGNOSTIC_PAYLOADS = original;
  }
}

function captureConsoleError(run: () => void): string[] {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    run();
  } finally {
    console.error = original;
  }
  return lines;
}

test("structural summaries describe shapes without exposing string content", () => {
  const summary = summarizeDiagnosticValue({
    identity: { name: { value: PII_SAMPLE, evidenceLines: [4, 10] } },
    techStack: ["大模型", "RAG"],
    sourcePageCount: null,
    valid: true,
  }) as { sample: Record<string, unknown> };

  const rendered = JSON.stringify(summary);
  assert.equal(rendered.includes(PII_SAMPLE), false);
  assert.equal(rendered.includes("大模型"), false);
  // Key paths, types, lengths, and numeric line numbers survive intact.
  const identity = summary.sample.identity as { sample: Record<string, unknown> };
  const name = identity.sample.name as { sample: Record<string, unknown> };
  assert.deepEqual(name.sample.value, { type: "string", chars: 6 });
  assert.deepEqual(name.sample.evidenceLines, { type: "array", length: 2, sample: [4, 10] });
  const techStack = summary.sample.techStack as { length: number };
  assert.equal(techStack.length, 2);
  assert.equal(summary.sample.sourcePageCount, null);
  assert.equal(summary.sample.valid, true);
});

test("diagnosticDump never logs PII by default, even for deeply nested values", () => {
  withPayloadFlag(undefined, () => {
    const lines = captureConsoleError(() => {
      diagnosticDump("[test] invalid structure:", {
        items: [{ title: PII_SAMPLE, evidenceLines: [1, 2, 3, 4, 5] }],
      });
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes(PII_SAMPLE), false);
    assert.match(lines[0], /"keyCount":1/);
    assert.match(lines[0], /"length":5/);
  });
});

test("diagnosticDump logs truncated raw payloads only when explicitly enabled", () => {
  withPayloadFlag("1", () => {
    assert.equal(diagnosticPayloadsEnabled(), true);
    const lines = captureConsoleError(() => {
      diagnosticDump("[test] raw:", { note: PII_SAMPLE });
    });
    assert.equal(lines[0].includes(PII_SAMPLE), true);
  });
  withPayloadFlag(undefined, () => {
    assert.equal(diagnosticPayloadsEnabled(), false);
  });
});

test("diagnostic summaries survive trace redaction unchanged", () => {
  const summary = summarizeDiagnosticValue({
    title: PII_SAMPLE,
    evidenceLines: [4, 10],
    fieldEvidence: { techStack: [] },
  });
  assert.deepEqual(redactTraceValue({ diagnostic: summary }), { diagnostic: summary });
});

test("failed model calls attach a structural diagnostic to the trace, without PII", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "diag-test-key";
  globalThis.fetch = (async () => Response.json({
    choices: [{
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_1",
          type: "function",
          // Structurally valid tool call whose arguments miss every required
          // field -- the invalid_structure path under test.
          function: { name: "submit_profile_result", arguments: "{}" },
        }],
      },
      finish_reason: "tool_calls",
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  })) as typeof fetch;

  const tracer = createAgentTracer();
  try {
    await assert.rejects(() => extractProfileWithAgentRun(
      `${PII_SAMPLE}\n后端工程师`,
      undefined,
      {
        tracer,
        providerConfig: {
          maasApiKey: "diag-test-key",
          maasBaseUrl: "https://internal-maas.example",
        },
      },
    ));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }

  const events = tracer.snapshot()!.events;
  const failed = events.filter((event) => event.type === "model.failed");
  assert.ok(failed.length >= 2, "both shards should fail with invalid_structure");
  for (const event of failed) {
    assert.equal(event.errorCode, "invalid_structure");
    assert.ok(event.diagnostic, "model.failed should carry the structural diagnostic");
  }
  // The whole trace (including diagnostics) must not contain the source PII.
  assert.equal(JSON.stringify(events).includes(PII_SAMPLE), false);
  // The shape points straight at the empty arguments object.
  const first = failed[0].diagnostic as { type: string; keyCount: number };
  assert.deepEqual(first, { type: "object", keyCount: 0, sample: {} });
  // And the trace inspector surfaces it for the in-app details panel.
  const metadata = traceEventMetadata(failed[0]);
  assert.ok(metadata && "结构摘要" in metadata);
});
