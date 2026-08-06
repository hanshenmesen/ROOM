import assert from "node:assert/strict";
import test from "node:test";
import {
  diagnosticDump,
  diagnosticPayloadsEnabled,
  summarizeDiagnosticValue,
} from "../lib/agent-runtime/diagnostics.ts";

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
