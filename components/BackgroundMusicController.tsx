"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  BACKGROUND_MUSIC_FADE_SECONDS,
  BACKGROUND_MUSIC_MAX_VOLUME,
  BACKGROUND_MUSIC_STORAGE_KEY,
  DEFAULT_MUSIC_BOX_TRACK,
  clampMediaVolume,
  normalizeMusicPreference,
} from "@/lib/background-music";

export type BackgroundMusicControllerHandle = {
  start: () => Promise<void>;
  stop: () => void;
};

let sharedAudio: HTMLAudioElement | null = null;
let sharedFadeFrame: number | null = null;

function readPreference() {
  if (typeof window === "undefined") return normalizeMusicPreference(null);
  try {
    return normalizeMusicPreference(JSON.parse(window.localStorage.getItem(BACKGROUND_MUSIC_STORAGE_KEY) || "null"));
  } catch {
    return normalizeMusicPreference(null);
  }
}

function writePreference(muted: boolean, volume: number) {
  try {
    window.localStorage.setItem(BACKGROUND_MUSIC_STORAGE_KEY, JSON.stringify({ muted, volume }));
  } catch {
    // Music preferences are non-critical.
  }
}

function ensureSharedAudio() {
  if (sharedAudio) return sharedAudio;
  const audio = new Audio(DEFAULT_MUSIC_BOX_TRACK.src);
  audio.loop = true;
  audio.preload = "metadata";
  audio.volume = 0;
  sharedAudio = audio;
  return audio;
}

function cancelSharedFade() {
  if (sharedFadeFrame === null) return;
  window.cancelAnimationFrame(sharedFadeFrame);
  sharedFadeFrame = null;
}

export const BackgroundMusicController = forwardRef<BackgroundMusicControllerHandle, { enabled: boolean; visible?: boolean }>(
  function BackgroundMusicController({ enabled, visible = true }, ref) {
    const [{ muted, volume }, setPreference] = useState(readPreference);
    const [started, setStarted] = useState(() => Boolean(sharedAudio && !sharedAudio.paused));
    const [failed, setFailed] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(sharedAudio);

    const targetVolume = useCallback(() => {
      return enabled && !muted && !document.hidden ? Math.min(volume, BACKGROUND_MUSIC_MAX_VOLUME) : 0;
    }, [enabled, muted, volume]);

    const fadeTo = useCallback((nextVolume: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      cancelSharedFade();
      const fromVolume = audio.volume;
      const startedAt = performance.now();
      const duration = Math.max(120, BACKGROUND_MUSIC_FADE_SECONDS * 1000);
      const step = (now: number) => {
        const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
        audio.volume = clampMediaVolume(fromVolume + (nextVolume - fromVolume) * progress);
        if (progress < 1) sharedFadeFrame = window.requestAnimationFrame(step);
        else sharedFadeFrame = null;
      };
      sharedFadeFrame = window.requestAnimationFrame(step);
    }, []);

    const start = useCallback(async () => {
      if (failed) return;
      try {
        const audio = ensureSharedAudio();
        audioRef.current = audio;
        if (audio.paused) await audio.play();
        setStarted(true);
        fadeTo(targetVolume());
      } catch {
        setFailed(true);
      }
    }, [failed, fadeTo, targetVolume]);

    const stop = useCallback(() => {
      const audio = audioRef.current || sharedAudio;
      if (!audio) return;
      cancelSharedFade();
      audio.volume = 0;
      audio.pause();
      setStarted(false);
    }, []);

    useImperativeHandle(ref, () => ({ start, stop }), [start, stop]);

    useEffect(() => {
      if (!sharedAudio) return;
      audioRef.current = sharedAudio;
      setStarted(!sharedAudio.paused);
    }, []);

    useEffect(() => {
      if (!enabled) fadeTo(0);
      else if (started) fadeTo(targetVolume());
    }, [enabled, fadeTo, started, targetVolume]);

    useEffect(() => {
      function handleVisibility() {
        if (document.hidden) stop();
        else if (!muted) void start();
      }
      function handleGesture() {
        if (enabled && !started && !muted) void start();
      }
      document.addEventListener("visibilitychange", handleVisibility);
      window.addEventListener("pointerdown", handleGesture, { passive: true });
      window.addEventListener("keydown", handleGesture);
      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("pointerdown", handleGesture);
        window.removeEventListener("keydown", handleGesture);
      };
    }, [enabled, muted, start, started, stop]);

    function toggleMuted() {
      const nextMuted = !muted;
      setPreference({ muted: nextMuted, volume });
      writePreference(nextMuted, volume);
      if (!nextMuted) void start();
      else stop();
    }

    return visible ? (
      <div className="background-music-control" aria-label="背景音乐控制">
        <button type="button" onClick={toggleMuted} aria-pressed={!muted && started}>
          <span aria-hidden="true">{muted || !started ? "♪" : "♫"}</span>
          {muted ? "音乐关闭" : started ? DEFAULT_MUSIC_BOX_TRACK.title : failed ? "音乐不可用" : "开启音乐"}
        </button>
      </div>
    ) : null;
  },
);
