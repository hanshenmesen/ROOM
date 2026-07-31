export const SCENE_COMPILE_TIMEOUT_MS = 8_000;

type SceneReadinessInput = {
  resourceProgress: number;
  portraitSettled: boolean;
  sceneCommitted: boolean;
  ready: boolean;
};

export function sceneReadinessProgress({
  resourceProgress,
  portraitSettled,
  sceneCommitted,
  ready,
}: SceneReadinessInput) {
  if (ready) return 100;

  const resourceStage = Math.max(0, Math.min(85, Math.round(resourceProgress * 0.85)));
  const portraitStage = portraitSettled ? 92 : 0;
  const committedStage = sceneCommitted ? 99 : 0;
  return Math.min(99, Math.max(resourceStage, portraitStage, committedStage));
}
