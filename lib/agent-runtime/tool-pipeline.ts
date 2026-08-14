import { runTracedTool } from "./tool-call.ts";
import type { AgentTracer } from "./tracer.ts";
import type { AgentToolSummary } from "./run-types.ts";

export type ToolGuardContext<I = unknown> = {
  tool: string;
  input: I;
};

export type ToolGuard<I = unknown, O = unknown> = {
  name: string;
  /** Runs before the tool executes; throw to block the call (a disallowed URL, an exhausted budget, ...). */
  pre?: (ctx: ToolGuardContext<I>) => void | Promise<void>;
  /** Runs after a successful call; a returned (non-`undefined`) value replaces the output (e.g. redacting a field). */
  post?: (ctx: ToolGuardContext<I>, output: O) => O | void | Promise<O | void>;
};

export type ToolDefinition<I, O> = {
  name: string;
  guards?: ToolGuard<I, O>[];
  run: (input: I) => Promise<O> | O;
  summarizeInput: (input: I) => AgentToolSummary;
  summarizeOutput: (output: O) => AgentToolSummary;
};

/**
 * Uniform `validate → guards.pre → run → redact (guards.post) → emit` call
 * path for every tool a bounded agent invokes (currently the website
 * research agent's `fetch_page`/`list_links`/`inspect_page`/
 * `extract_media`/`validate_claim`/`submit_profile`).
 *
 * Before this existed, each tool call site hand-assembled its own
 * budget-check-then-trace sequence (see `callTool()` in
 * `agents/website/agent.ts`), so a new safety policy meant editing every
 * call site instead of registering one `ToolGuard`. `invoke()` always goes
 * through `runTracedTool`, so every registered tool gets the same
 * `tool.started`/`tool.completed`/`tool.failed` trace shape for free.
 */
export class ToolPipeline {
  private readonly tools = new Map<string, ToolDefinition<never, never>>();
  private readonly tracer: AgentTracer;
  private readonly step: string;

  constructor(input: { tracer: AgentTracer; step: string }) {
    this.tracer = input.tracer;
    this.step = input.step;
  }

  /** Registers a tool definition, replacing any existing one with the same name. Returns a disposer that unregisters it (a no-op if it was already replaced/removed). */
  register<I, O>(def: ToolDefinition<I, O>): () => void {
    this.tools.set(def.name, def as unknown as ToolDefinition<never, never>);
    return () => {
      if (this.tools.get(def.name) === (def as unknown as ToolDefinition<never, never>)) this.tools.delete(def.name);
    };
  }

  async invoke<I, O>(name: string, input: I): Promise<O> {
    const def = this.tools.get(name) as unknown as ToolDefinition<I, O> | undefined;
    if (!def) throw new Error(`ToolPipeline: tool "${name}" is not registered.`);
    const guards = def.guards || [];
    const ctx: ToolGuardContext<I> = { tool: name, input };
    for (const guard of guards) await guard.pre?.(ctx);
    return runTracedTool<O>({
      tracer: this.tracer,
      step: this.step,
      tool: name,
      inputSummary: def.summarizeInput(input),
      call: async () => {
        let output = await def.run(input);
        for (const guard of guards) {
          const replaced = await guard.post?.(ctx, output);
          if (replaced !== undefined) output = replaced;
        }
        return output;
      },
      summarizeOutput: def.summarizeOutput,
    });
  }
}
