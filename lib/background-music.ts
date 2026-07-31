export const BACKGROUND_MUSIC_STORAGE_KEY = "room:background-music:v1";
export const BACKGROUND_MUSIC_MAX_VOLUME = 0.18;
export const BACKGROUND_MUSIC_FADE_SECONDS = 1.8;

export type BackgroundMusicPreference = {
  muted: boolean;
  volume: number;
};

export function normalizeMusicPreference(value: unknown): BackgroundMusicPreference {
  if (!value || typeof value !== "object") return { muted: false, volume: BACKGROUND_MUSIC_MAX_VOLUME };
  const candidate = value as Partial<BackgroundMusicPreference>;
  const volume = typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
    ? Math.max(0, Math.min(BACKGROUND_MUSIC_MAX_VOLUME, candidate.volume))
    : BACKGROUND_MUSIC_MAX_VOLUME;
  return {
    muted: Boolean(candidate.muted),
    volume,
  };
}
