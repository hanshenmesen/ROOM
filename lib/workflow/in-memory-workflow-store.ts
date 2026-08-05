import type { WorkflowRecord, WorkflowStore } from "./types.ts";

const MAX_RUNS = 100;
const STORE_KEY = Symbol.for("room.workflow.store.v1");

type StoreState = {
  runs: Map<string, WorkflowRecord>;
  idempotencyKeys: Map<string, string>;
};

function state() {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: StoreState };
  root[STORE_KEY] ||= { runs: new Map(), idempotencyKeys: new Map() };
  return root[STORE_KEY];
}

function clone(record: WorkflowRecord) {
  return structuredClone(record);
}

export class InMemoryWorkflowStore implements WorkflowStore {
  async create(record: WorkflowRecord) {
    const current = state();
    if (current.runs.has(record.state.runId)) throw new Error(`Workflow run already exists: ${record.state.runId}.`);
    if (record.idempotencyKey) {
      const existing = current.idempotencyKeys.get(record.idempotencyKey);
      if (existing) throw new Error(`Idempotency key already belongs to ${existing}.`);
      current.idempotencyKeys.set(record.idempotencyKey, record.state.runId);
    }
    current.runs.set(record.state.runId, clone(record));
    while (current.runs.size > MAX_RUNS) {
      const oldestRunId = current.runs.keys().next().value;
      if (!oldestRunId) break;
      const oldest = current.runs.get(oldestRunId);
      if (oldest?.idempotencyKey) current.idempotencyKeys.delete(oldest.idempotencyKey);
      current.runs.delete(oldestRunId);
    }
  }

  async get(runId: string) {
    const record = state().runs.get(runId);
    return record ? clone(record) : undefined;
  }

  async save(record: WorkflowRecord) {
    const current = state();
    if (!current.runs.has(record.state.runId)) throw new Error(`Workflow run does not exist: ${record.state.runId}.`);
    current.runs.set(record.state.runId, clone(record));
  }

  async findRunIdByIdempotencyKey(key: string) {
    return state().idempotencyKeys.get(key);
  }

  async clear() {
    state().runs.clear();
    state().idempotencyKeys.clear();
  }
}

export const inMemoryWorkflowStore = new InMemoryWorkflowStore();
