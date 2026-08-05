export type AgentRunBudgetLimits = {
  maxModelCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCostUsd: number;
  maxDurationMs: number;
};

export type AgentRunBudgetUsage = {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
};

export const DEFAULT_AGENT_RUN_BUDGET: AgentRunBudgetLimits = {
  maxModelCalls: 16,
  maxInputTokens: 600_000,
  maxOutputTokens: 160_000,
  maxEstimatedCostUsd: 20,
  maxDurationMs: 240_000,
};

export type AgentBudgetReason = "model_calls" | "input_tokens" | "output_tokens" | "estimated_cost" | "duration";

export class AgentBudgetExceededError extends Error {
  readonly status = 429;
  readonly reason: AgentBudgetReason;

  constructor(reason: AgentBudgetReason) {
    super(`Agent run stopped because the ${reason} budget was exhausted.`);
    this.name = "AgentBudgetExceededError";
    this.reason = reason;
  }
}

export class AgentRunBudget {
  readonly limits: AgentRunBudgetLimits;
  private readonly startedAt = performance.now();
  private modelCalls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private estimatedCostUsd = 0;

  constructor(limits: Partial<AgentRunBudgetLimits> = {}) {
    this.limits = { ...DEFAULT_AGENT_RUN_BUDGET, ...limits };
  }

  reserve(input: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }) {
    if (performance.now() - this.startedAt >= this.limits.maxDurationMs) {
      throw new AgentBudgetExceededError("duration");
    }
    if (this.modelCalls + 1 > this.limits.maxModelCalls) throw new AgentBudgetExceededError("model_calls");
    if (this.inputTokens + input.inputTokens > this.limits.maxInputTokens) throw new AgentBudgetExceededError("input_tokens");
    if (this.outputTokens + input.outputTokens > this.limits.maxOutputTokens) throw new AgentBudgetExceededError("output_tokens");
    if (this.estimatedCostUsd + input.estimatedCostUsd > this.limits.maxEstimatedCostUsd) {
      throw new AgentBudgetExceededError("estimated_cost");
    }
    this.modelCalls += 1;
    this.inputTokens += input.inputTokens;
    this.outputTokens += input.outputTokens;
    this.estimatedCostUsd += input.estimatedCostUsd;
    return this.snapshot();
  }

  snapshot(): AgentRunBudgetUsage {
    return {
      modelCalls: this.modelCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      estimatedCostUsd: Number(this.estimatedCostUsd.toFixed(6)),
      elapsedMs: Math.max(0, Math.round(performance.now() - this.startedAt)),
    };
  }
}

export class ProviderCircuitBreaker {
  private readonly failures = new Map<string, { count: number; openUntil: number }>();
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 30_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  isOpen(provider: string) {
    const state = this.failures.get(provider);
    if (!state) return false;
    if (state.openUntil > Date.now()) return true;
    if (state.openUntil) this.failures.delete(provider);
    return false;
  }

  recordSuccess(provider: string) {
    this.failures.delete(provider);
  }

  recordFailure(provider: string) {
    const previous = this.failures.get(provider);
    const count = (previous?.count || 0) + 1;
    this.failures.set(provider, {
      count,
      openUntil: count >= this.threshold ? Date.now() + this.cooldownMs : 0,
    });
    return count;
  }
}

export class AgentRunControls {
  readonly budget: AgentRunBudget;
  readonly circuitBreaker: ProviderCircuitBreaker;
  readonly signal?: AbortSignal;

  constructor(input: {
    budget?: Partial<AgentRunBudgetLimits>;
    signal?: AbortSignal;
    circuitFailureThreshold?: number;
  } = {}) {
    this.budget = new AgentRunBudget(input.budget);
    this.circuitBreaker = new ProviderCircuitBreaker(input.circuitFailureThreshold);
    this.signal = input.signal;
  }

  requestSignal(timeoutMs: number) {
    this.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(timeoutMs);
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }

  async boundedBackoff(failureCount: number) {
    this.signal?.throwIfAborted();
    const delayMs = Math.min(400, 50 * (2 ** Math.max(0, failureCount - 1)));
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout);
        reject(this.signal?.reason || new DOMException("Aborted", "AbortError"));
      };
      const timeout = setTimeout(() => {
        this.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delayMs);
      this.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
