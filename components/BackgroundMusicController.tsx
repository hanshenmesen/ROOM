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
  normalizeMusicPreference,
} from "@/lib/background-music";

export type BackgroundMusicControllerHandle = {
  start: () => Promise<void>;
  stop: () => void;
};

type Voice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

let sharedContext: AudioContext | null = null;
let sharedMasterGain: GainNode | null = null;
let sharedVoices: Voice[] = [];

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

export const BackgroundMusicController = forwardRef<BackgroundMusicControllerHandle, { enabled: boolean; visible?: boolean }>(
  function BackgroundMusicController({ enabled, visible = true }, ref) {
    const [{ muted, volume }, setPreference] = useState(readPreference);
    const [started, setStarted] = useState(() => Boolean(sharedContext));
    const [failed, setFailed] = useState(false);
    const contextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const voicesRef = useRef<Voice[]>([]);

    const targetVolume = useCallback(() => {
      return enabled && !muted && !document.hidden ? Math.min(volume, BACKGROUND_MUSIC_MAX_VOLUME) : 0;
    }, [enabled, muted, volume]);

    const fadeTo = useCallback((nextVolume: number) => {
      const context = contextRef.current;
      const gain = masterGainRef.current;
      if (!context || !gain) return;
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
      gain.gain.linearRampToValueAtTime(nextVolume, context.currentTime + BACKGROUND_MUSIC_FADE_SECONDS);
    }, []);

    const start = useCallback(async () => {
      if (failed) return;
      try {
        const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        const context = sharedContext || new AudioCtor();
        sharedContext = context;
        contextRef.current = context;
        if (context.state === "suspended") await context.resume();
        if (!sharedMasterGain) {
          const master = context.createGain();
          master.gain.value = 0;
          master.connect(context.destination);
          sharedMasterGain = master;
          masterGainRef.current = master;
          const notes = [
            { frequency: 196, gain: 0.045, type: "sine" as OscillatorType },
            { frequency: 246.94, gain: 0.026, type: "triangle" as OscillatorType },
            { frequency: 329.63, gain: 0.018, type: "sine" as OscillatorType },
          ];
          sharedVoices = notes.map((note) => {
            const oscillator = context.createOscillator();
            const voiceGain = context.createGain();
            oscillator.type = note.type;
            oscillator.frequency.value = note.frequency;
            voiceGain.gain.value = note.gain;
            oscillator.connect(voiceGain);
            voiceGain.connect(master);
            oscillator.start();
            return { oscillator, gain: voiceGain };
          });
          voicesRef.current = sharedVoices;
        } else {
          masterGainRef.current = sharedMasterGain;
          voicesRef.current = sharedVoices;
        }
        setStarted(true);
        fadeTo(targetVolume());
      } catch {
        setFailed(true);
      }
    }, [failed, fadeTo, targetVolume]);

    const stop = useCallback(() => {
      fadeTo(0);
    }, [fadeTo]);

    useImperativeHandle(ref, () => ({ start, stop }), [start, stop]);

    useEffect(() => {
      if (!sharedContext || !sharedMasterGain) return;
      contextRef.current = sharedContext;
      masterGainRef.current = sharedMasterGain;
      voicesRef.current = sharedVoices;
    }, []);

    useEffect(() => {
      if (!enabled) stop();
      else if (started) fadeTo(targetVolume());
    }, [enabled, fadeTo, started, stop, targetVolume]);

    useEffect(() => {
      function handleVisibility() {
        if (document.hidden) stop();
        else if (started) void start();
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
          {muted ? "音乐关闭" : started ? "背景音乐" : failed ? "音乐不可用" : "开启音乐"}
        </button>
      </div>
    ) : null;
  },
);
