export const BACKGROUND_MUSIC_STORAGE_KEY = "room:background-music:v1";
export const BACKGROUND_MUSIC_MAX_VOLUME = 0.18;
export const BACKGROUND_MUSIC_FADE_SECONDS = 1.8;

export const MUSIC_BOX_TRACKS = [
  {
    id: "heavenly-loop",
    title: "Heavenly Loop",
    artist: "isaiah658",
    src: "/assets/music/heavenly-loop.mp3",
    license: "CC0 1.0",
    sourceUrl: "https://opengameart.org/content/heavenly-loop",
  },
  {
    id: "forest-ambience",
    title: "Forest Ambience",
    artist: "TinyWorlds",
    src: "/assets/music/forest-ambience.mp3",
    license: "CC0 1.0",
    sourceUrl: "https://opengameart.org/content/forest-ambience",
  },
  {
    id: "keep-your-dream-alive",
    title: "Keep Your Dream Alive!",
    artist: "congusbongus",
    src: "/assets/music/keep-your-dream-alive.mp3",
    license: "CC0 1.0",
    sourceUrl: "https://opengameart.org/content/keep-your-dream-alive-seamless-loop",
  },
] as const;

export type MusicBoxTrackId = (typeof MUSIC_BOX_TRACKS)[number]["id"];
export const DEFAULT_MUSIC_BOX_TRACK = MUSIC_BOX_TRACKS[0];

export function musicBoxTrack(trackId: string) {
  return MUSIC_BOX_TRACKS.find((track) => track.id === trackId);
}

export function clampMediaVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export type BackgroundMusicPreference = {
  muted: boolean;
  volume: number;
};

export function normalizeMusicPreference(value: unknown): BackgroundMusicPreference {
  if (!value || typeof value !== "object") return { muted: false, volume: BACKGROUND_MUSIC_MAX_VOLUME };
  const candidate = value as Partial<BackgroundMusicPreference>;
  const volume = typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
    ? Math.min(BACKGROUND_MUSIC_MAX_VOLUME, clampMediaVolume(candidate.volume))
    : BACKGROUND_MUSIC_MAX_VOLUME;
  return {
    muted: Boolean(candidate.muted),
    volume,
  };
}
