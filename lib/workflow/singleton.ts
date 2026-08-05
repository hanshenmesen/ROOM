import { RoomWorkflowEngine } from "./room-workflow.ts";

const ENGINE_KEY = Symbol.for("room.workflow.engine.v1");

function sharedEngine() {
  const root = globalThis as typeof globalThis & { [ENGINE_KEY]?: RoomWorkflowEngine };
  root[ENGINE_KEY] ||= new RoomWorkflowEngine();
  return root[ENGINE_KEY];
}

export const roomWorkflowEngine = sharedEngine();
