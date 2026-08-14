import type { ToolGuard } from "./tool-pipeline.ts";

/**
 * Blocks a tool call whose extracted URL falls outside the Run's approved
 * hosts. Kept as a thin adapter over the caller-supplied `assertAllowed`
 * (e.g. `assertAllowedResearchUrl` in `agents/website/policy.ts`) rather
 * than owning the SSRF/DNS-resolution logic itself: that logic belongs
 * next to the fetcher it protects (`lib/public-web.ts`), not in a generic
 * pipeline guard, so it stays covered by the security test suite that
 * already exercises it directly.
 */
export function sameHostGuard<I, O = unknown>(input: {
  extractUrl: (toolInput: I) => string | undefined;
  allowedHosts: () => Iterable<string>;
  assertAllowed: (url: string, hosts: Iterable<string>) => void;
}): ToolGuard<I, O> {
  return {
    name: "same-host",
    pre: ({ input: toolInput }) => {
      const url = input.extractUrl(toolInput);
      if (!url) return;
      input.assertAllowed(url, input.allowedHosts());
    },
  };
}

/** Blocks a tool call once a Run/agent-scoped budget (steps, time, bytes, ...) is exhausted. */
export function budgetGuard<I, O = unknown>(input: {
  canCall: (toolInput: I) => boolean;
  onExceeded: () => never;
  /** Optional side effect (e.g. incrementing a step counter) once the call is allowed to proceed. */
  onAllowed?: (toolInput: I) => void;
}): ToolGuard<I, O> {
  return {
    name: "budget",
    pre: ({ input: toolInput }) => {
      if (!input.canCall(toolInput)) input.onExceeded();
      input.onAllowed?.(toolInput);
    },
  };
}

/** Blocks a tool call whose own (already-derived) abort signal has fired, independent of the Run's overall signal. */
export function timeoutGuard<I, O = unknown>(signalFor: (toolInput: I) => AbortSignal | undefined): ToolGuard<I, O> {
  return {
    name: "timeout",
    pre: ({ input: toolInput }) => {
      signalFor(toolInput)?.throwIfAborted();
    },
  };
}

/** Redacts fields from a tool's output before it is traced/returned. */
export function outputRedactionGuard<I, O>(redact: (output: O) => O): ToolGuard<I, O> {
  return {
    name: "output-redaction",
    post: (_ctx, output) => redact(output),
  };
}
