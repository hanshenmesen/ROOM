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

/**
 * One source of truth for the longest supported Profile Agent run.
 *
 * Provider requests, stale-run detection, and concurrency leases derive from
 * these values so a live request can never outlast the lease that protects it.
 */
export const PROFILE_AGENT_REQUEST_TIMEOUT_MS = 20 * 60_000;
export const PROFILE_AGENT_RUN_TIMEOUT_MS = 40 * 60_000;
export const PROFILE_AGENT_RUN_GRACE_MS = 5 * 60_000;
export const PROFILE_AGENT_LEASE_TTL_MS = PROFILE_AGENT_RUN_TIMEOUT_MS + PROFILE_AGENT_RUN_GRACE_MS;

// Generating a full 16k-token structured extraction through a proxied
// gateway (e.g. Xiaohongshu's internal MAAS gateway) has been observed to
// take well past 120s for the denser "items" shard alone. Rather than tune
// a fragile threshold against an unconfirmed P99, the profile agent's
// per-request timeout is a generous 20 minutes, so
// this wall-clock budget must be at least 2x that to leave room for one
// slow attempt plus one full retry.
export const DEFAULT_AGENT_RUN_BUDGET: AgentRunBudgetLimits = {
  maxModelCalls: 16,
  maxInputTokens: 600_000,
  maxOutputTokens: 160_000,
  maxEstimatedCostUsd: 20,
  maxDurationMs: PROFILE_AGENT_RUN_TIMEOUT_MS,
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
  private readonly startedAt: number;
  private modelCalls: number;
  private inputTokens: number;
  private outputTokens: number;
  private estimatedCostUsd: number;

  constructor(limits: Partial<AgentRunBudgetLimits> = {}, initialUsage: Partial<AgentRunBudgetUsage> = {}) {
    this.limits = { ...DEFAULT_AGENT_RUN_BUDGET, ...limits };
    this.startedAt = performance.now() - Math.max(0, initialUsage.elapsedMs || 0);
    this.modelCalls = Math.max(0, initialUsage.modelCalls || 0);
    this.inputTokens = Math.max(0, initialUsage.inputTokens || 0);
    this.outputTokens = Math.max(0, initialUsage.outputTokens || 0);
    this.estimatedCostUsd = Math.max(0, initialUsage.estimatedCostUsd || 0);
  }

  reserve(input: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }) {
    if (this.remainingDurationMs() <= 0) {
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

  remainingDurationMs() {
    return Math.max(0, this.limits.maxDurationMs - (performance.now() - this.startedAt));
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
  private readonly onUsageChanged?: (usage: AgentRunBudgetUsage) => void | Promise<void>;
  private usagePersistence = Promise.resolve();

  constructor(input: {
    budget?: Partial<AgentRunBudgetLimits>;
    signal?: AbortSignal;
    circuitFailureThreshold?: number;
    initialUsage?: Partial<AgentRunBudgetUsage>;
    onUsageChanged?: (usage: AgentRunBudgetUsage) => void | Promise<void>;
  } = {}) {
    this.budget = new AgentRunBudget(input.budget, input.initialUsage);
    this.circuitBreaker = new ProviderCircuitBreaker(input.circuitFailureThreshold);
    this.signal = input.signal;
    this.onUsageChanged = input.onUsageChanged;
  }

  async reserve(input: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }) {
    const usage = this.budget.reserve(input);
    if (this.onUsageChanged) {
      // Model shards may reserve in parallel. Serialize persistence so an
      // older snapshot can never overwrite a newer one before requests start.
      this.usagePersistence = this.usagePersistence.then(() => this.onUsageChanged!(usage));
      await this.usagePersistence;
    }
    return usage;
  }

  requestSignal(timeoutMs: number) {
    this.signal?.throwIfAborted();
    const remainingDurationMs = this.budget.remainingDurationMs();
    if (remainingDurationMs <= 0) throw new AgentBudgetExceededError("duration");
    // A request that starts near the end of a Run must not outlive the Run
    // budget (and, by extension, the concurrency lease protecting it).
    const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(timeoutMs, remainingDurationMs))));
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }

  async boundedBackoff(failureCount: number) {
    this.signal?.throwIfAborted();
    const remainingDurationMs = this.budget.remainingDurationMs();
    if (remainingDurationMs <= 0) throw new AgentBudgetExceededError("duration");
    const delayMs = Math.max(1, Math.ceil(Math.min(
      remainingDurationMs,
      400,
      50 * (2 ** Math.max(0, failureCount - 1)),
    )));
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
