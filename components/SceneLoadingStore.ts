export type SceneLoadingSnapshot = {
  loaded: number;
  total: number;
  progress: number;
  errors: number;
  status: "idle" | "loading" | "ready" | "degraded" | "failed";
  failedUrls: string[];
  lastError?: string;
};

export type SceneLoadingGeneration = number;

export type SceneAssetLoadToken = {
  generation: SceneLoadingGeneration;
  url: string;
  settled: boolean;
};

const emptySnapshot: SceneLoadingSnapshot = {
  loaded: 0,
  total: 0,
  progress: 0,
  errors: 0,
  status: "idle",
  failedUrls: [],
};

let snapshot: SceneLoadingSnapshot = emptySnapshot;
let activeGeneration: SceneLoadingGeneration = 0;
let activeCounter = { loaded: 0, total: 0 };
const listeners = new Set<() => void>();

function sameUrls(a: string[], b: string[]) {
  return a.length === b.length && a.every((url, index) => url === b[index]);
}

function sameSnapshot(a: SceneLoadingSnapshot, b: SceneLoadingSnapshot) {
  return (
    a.loaded === b.loaded &&
    a.total === b.total &&
    a.progress === b.progress &&
    a.errors === b.errors &&
    a.status === b.status &&
    a.lastError === b.lastError &&
    sameUrls(a.failedUrls, b.failedUrls)
  );
}

function publish(next: SceneLoadingSnapshot) {
  if (sameSnapshot(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function loadingStatus() {
  if (snapshot.status === "failed") return "failed";
  return snapshot.errors ? "degraded" : "loading";
}

function errorMessage(url: string, error?: unknown) {
  if (error instanceof Error && error.message) return `${url}: ${error.message}`;
  if (typeof error === "string" && error) return `${url}: ${error}`;
  return url;
}

export function beginSceneLoading() {
  activeGeneration += 1;
  activeCounter = { loaded: 0, total: 0 };
  publish({ ...emptySnapshot, failedUrls: [] });
  return activeGeneration;
}

export function getSceneLoadingSnapshot() {
  return snapshot;
}

export function getSceneLoadingGeneration() {
  return activeGeneration;
}

export function subscribeSceneLoading(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isActiveGeneration(generation: SceneLoadingGeneration) {
  return generation === activeGeneration;
}

export function markSceneLoadingStarted(
  generation: SceneLoadingGeneration,
  loaded: number,
  total: number,
) {
  if (!isActiveGeneration(generation)) return;
  publish({
    ...snapshot,
    loaded,
    total,
    progress: total ? (loaded / total) * 100 : 0,
    status: loadingStatus(),
  });
}

export function markSceneLoadingProgress(
  generation: SceneLoadingGeneration,
  loaded: number,
  total: number,
) {
  if (!isActiveGeneration(generation)) return;
  publish({
    ...snapshot,
    loaded,
    total,
    progress: total ? (loaded / total) * 100 : 0,
    status: loadingStatus(),
  });
}

export function markSceneLoadingComplete(generation: SceneLoadingGeneration) {
  if (!isActiveGeneration(generation)) return;
  publish({
    ...snapshot,
    loaded: snapshot.total,
    progress: 100,
    status: snapshot.status === "failed" ? "failed" : snapshot.errors ? "degraded" : "ready",
  });
}

export function recordSceneLoadError(
  generation: SceneLoadingGeneration,
  url: string,
  status: "degraded" | "failed",
  error?: unknown,
) {
  if (!isActiveGeneration(generation)) return;
  const failedUrls = snapshot.failedUrls.includes(url)
    ? snapshot.failedUrls
    : [...snapshot.failedUrls, url];
  publish({
    ...snapshot,
    errors: failedUrls.length,
    status: snapshot.status === "failed" ? "failed" : status,
    failedUrls,
    lastError: errorMessage(url, error),
  });
}

export function startSceneAssetLoad(url: string): SceneAssetLoadToken {
  const token = {
    generation: activeGeneration,
    url,
    settled: false,
  };
  activeCounter.total += 1;
  markSceneLoadingStarted(token.generation, activeCounter.loaded, activeCounter.total);
  return token;
}

export function recordSceneAssetLoadError(
  token: SceneAssetLoadToken,
  status: "degraded" | "failed",
  error?: unknown,
) {
  if (token.settled) return;
  recordSceneLoadError(token.generation, token.url, status, error);
}

export function completeSceneAssetLoad(token: SceneAssetLoadToken) {
  if (token.settled) return;
  token.settled = true;
  if (!isActiveGeneration(token.generation)) return;

  activeCounter.loaded = Math.min(activeCounter.loaded + 1, activeCounter.total);
  markSceneLoadingProgress(token.generation, activeCounter.loaded, activeCounter.total);
  if (activeCounter.loaded >= activeCounter.total) {
    markSceneLoadingComplete(token.generation);
  }
}
