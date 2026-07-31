"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { browserPetQaConfigHeaders, type BrowserAgentConfig } from "@/lib/browser-agent-config";
import {
  PET_VOICE_STORAGE_KEY,
  PetPcmPlayer,
  normalizePetVoicePreference,
  petTtsConfigFromEnvironment,
  streamPetTts,
  type PetVoicePreference,
  type PetTtsStreamState,
} from "@/lib/pet-voice";
import { ROOM_COMPANION_NAME } from "@/lib/room-companion";
import type { ParsedProfile } from "@/lib/types";

type PetQaMessage = {
  role: "user" | "assistant";
  content: string;
};

type PetQaCitation = {
  itemId: string;
  title: string;
  excerpt: string;
};

type PetQaPanelProps = {
  profile: ParsedProfile | null;
  config: BrowserAgentConfig | null;
  open: boolean;
  onClose: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

type PetVoiceStatus = PetTtsStreamState | "idle" | "fallback" | "error";

function readVoicePreference() {
  if (typeof window === "undefined") return normalizePetVoicePreference(null);
  try {
    return normalizePetVoicePreference(JSON.parse(window.localStorage.getItem(PET_VOICE_STORAGE_KEY) || "null"));
  } catch {
    return normalizePetVoicePreference(null);
  }
}

function writeVoicePreference(preference: PetVoicePreference) {
  try {
    window.localStorage.setItem(PET_VOICE_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Voice preferences are non-critical.
  }
}

function voiceStatusLabel(status: PetVoiceStatus, enabled: boolean, available: boolean) {
  if (!available) return "语音未配置";
  if (!enabled) return "语音已关闭";
  if (status === "connecting") return "连接 Qwen3-TTS…";
  if (status === "synthesizing") return "正在生成声音…";
  if (status === "streaming" || status === "done") return "宠物正在说话";
  if (status === "fallback") return "正在使用系统语音";
  if (status === "error") return "语音暂时不可用";
  return "回答后自动朗读";
}

export function PetQaPanel({ profile, config, open, onClose, onSpeechStart, onSpeechEnd }: PetQaPanelProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<PetQaMessage[]>([]);
  const [citations, setCitations] = useState<PetQaCitation[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [voicePreference, setVoicePreference] = useState(readVoicePreference);
  const [voiceStatus, setVoiceStatus] = useState<PetVoiceStatus>("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [speechActive, setSpeechActive] = useState(false);
  const ttsConfig = useMemo(() => petTtsConfigFromEnvironment(), []);
  const playerRef = useRef<PetPcmPlayer | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const voiceGenerationRef = useRef(0);
  const speechActiveRef = useRef(false);
  const lastAnswer = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.content || "",
    [messages],
  );
  const finishSpeechActivity = useCallback(() => {
    if (!speechActiveRef.current) return;
    speechActiveRef.current = false;
    setSpeechActive(false);
    onSpeechEnd?.();
  }, [onSpeechEnd]);

  const startSpeechActivity = useCallback(() => {
    if (speechActiveRef.current) return;
    speechActiveRef.current = true;
    setSpeechActive(true);
    onSpeechStart?.();
  }, [onSpeechStart]);

  const stopVoiceResources = useCallback((resumeAmbient = true) => {
    voiceGenerationRef.current += 1;
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    playerRef.current?.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (resumeAmbient) finishSpeechActivity();
  }, [finishSpeechActivity]);

  const cancelVoice = useCallback((resumeAmbient = true) => {
    stopVoiceResources(resumeAmbient);
    setVoiceStatus("idle");
    setVoiceNotice("");
  }, [stopVoiceResources]);

  const speakWithSystemVoice = useCallback((text: string, generation: number) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceStatus("error");
      setVoiceNotice("Qwen3-TTS 暂时不可用，且当前浏览器没有系统语音降级能力。");
      finishSpeechActivity();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.02;
    utterance.pitch = 1.04;
    utterance.volume = voicePreference.volume;
    utterance.onend = () => {
      if (generation !== voiceGenerationRef.current) return;
      setVoiceStatus("idle");
      finishSpeechActivity();
    };
    utterance.onerror = () => {
      if (generation !== voiceGenerationRef.current) return;
      setVoiceStatus("error");
      setVoiceNotice("Qwen3-TTS 与系统语音都没有成功播放，请稍后重试。");
      finishSpeechActivity();
    };
    setVoiceStatus("fallback");
    setVoiceNotice("Qwen3-TTS 连接失败，已自动切换到浏览器系统语音。");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [finishSpeechActivity, voicePreference.volume]);

  const speakAnswer = useCallback(async (text: string) => {
    if (!voicePreference.enabled || !ttsConfig.enabled || !text.trim()) return;
    cancelVoice(false);
    const generation = voiceGenerationRef.current;
    const abort = new AbortController();
    voiceAbortRef.current = abort;
    const player = playerRef.current || new PetPcmPlayer();
    playerRef.current = player;
    player.setVolume(voicePreference.volume);
    startSpeechActivity();
    setVoiceNotice("");
    try {
      await player.unlock();
      await streamPetTts({
        text,
        config: ttsConfig,
        signal: abort.signal,
        onState: (state) => {
          if (generation === voiceGenerationRef.current) setVoiceStatus(state);
        },
        onAudio: (chunk) => {
          if (generation === voiceGenerationRef.current) player.enqueue(chunk);
        },
      });
      await player.whenDrained();
      if (generation !== voiceGenerationRef.current) return;
      voiceAbortRef.current = null;
      setVoiceStatus("idle");
      finishSpeechActivity();
    } catch (caught) {
      if (generation !== voiceGenerationRef.current) return;
      voiceAbortRef.current = null;
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      player.stop();
      speakWithSystemVoice(text, generation);
    }
  }, [cancelVoice, finishSpeechActivity, speakWithSystemVoice, startSpeechActivity, ttsConfig, voicePreference.enabled, voicePreference.volume]);

  useEffect(() => {
    if (!open) stopVoiceResources();
  }, [open, stopVoiceResources]);

  useEffect(() => () => {
    stopVoiceResources();
    playerRef.current?.dispose();
  }, [stopVoiceResources]);

  function updateVoicePreference(next: PetVoicePreference) {
    const normalized = normalizePetVoicePreference(next);
    setVoicePreference(normalized);
    writeVoicePreference(normalized);
    playerRef.current?.setVolume(normalized.volume);
    if (!normalized.enabled) cancelVoice();
  }

  function closePanel() {
    cancelVoice();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    if (!profile) {
      setError("请先完成资料解析，再向大厅宠物提问。");
      return;
    }
    cancelVoice();
    if (voicePreference.enabled && ttsConfig.enabled) {
      const player = playerRef.current || new PetPcmPlayer();
      playerRef.current = player;
      player.setVolume(voicePreference.volume);
      void player.unlock().catch(() => {
        // The Qwen stream has a browser speech fallback if Web Audio cannot start.
      });
    }
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/pet-qa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...browserPetQaConfigHeaders(config),
        },
        body: JSON.stringify({
          profile,
          question: trimmed,
          history: messages.slice(-8),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        answer?: string;
        citations?: PetQaCitation[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "宠物 QA 暂时不可用。");
      const answer = payload?.answer?.trim() || "我还不知道怎么回答这个问题。";
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
      setCitations(Array.isArray(payload?.citations) ? payload.citations : []);
      if (voicePreference.enabled) void speakAnswer(answer);
    } catch (caught) {
      setMessages(messages);
      setError(caught instanceof Error ? caught.message : "宠物 QA 暂时不可用。");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  const displayedVoiceStatus = speechActive ? voiceStatus : voiceStatus === "error" ? "error" : "idle";
  const displayedVoiceNotice = speechActive || voiceStatus === "error" ? voiceNotice : "";

  return (
    <aside id="pet-qa-panel" className="pet-qa-panel" aria-label="大厅宠物问答">
      <header>
        <div>
          <span>ROOM PET QA</span>
          <h2>{ROOM_COMPANION_NAME}</h2>
        </div>
        <button type="button" onClick={closePanel} aria-label="关闭宠物问答">×</button>
      </header>
      <div className="pet-qa-voice-toolbar" aria-label="宠物语音控制">
        <button
          type="button"
          className="pet-voice-toggle"
          aria-pressed={voicePreference.enabled}
          disabled={!ttsConfig.enabled}
          onClick={() => updateVoicePreference({ ...voicePreference, enabled: !voicePreference.enabled })}
        >
          <span aria-hidden="true">{voicePreference.enabled ? "◉" : "○"}</span>
          {voiceStatusLabel(displayedVoiceStatus, voicePreference.enabled, ttsConfig.enabled)}
        </button>
        <label>
          <span>音量</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={voicePreference.volume}
            disabled={!ttsConfig.enabled}
            onChange={(event) => updateVoicePreference({ ...voicePreference, volume: Number(event.target.value) })}
            aria-label="宠物语音音量"
          />
        </label>
        {lastAnswer && voicePreference.enabled && ttsConfig.enabled ? (
          <button type="button" onClick={() => void speakAnswer(lastAnswer)} disabled={pending || speechActive}>重播</button>
        ) : null}
        {["connecting", "synthesizing", "streaming", "done", "fallback"].includes(displayedVoiceStatus) ? (
          <button type="button" onClick={() => cancelVoice()} aria-label="停止宠物语音">停止</button>
        ) : null}
      </div>
      {displayedVoiceNotice ? <p className="pet-voice-notice" role={displayedVoiceStatus === "error" ? "alert" : "status"}>{displayedVoiceNotice}</p> : null}
      <div className="pet-qa-body" role="log" aria-live="polite">
        {messages.length ? messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`pet-qa-message is-${message.role}`}>
            {message.content}
          </p>
        )) : (
          <p className="pet-qa-empty">我是小白，可以根据已解析的简历和个人网站资料，帮主人回答项目、经历、技能相关问题。</p>
        )}
        {pending ? <p className="pet-qa-message is-assistant">我正在翻资料……</p> : null}
      </div>
      {citations.length ? (
        <div className="pet-qa-citations" aria-label="回答引用">
          {citations.map((citation) => (
            <article key={`${citation.itemId}-${citation.excerpt}`}>
              <strong>{citation.title}</strong>
              <small>{citation.excerpt}</small>
            </article>
          ))}
        </div>
      ) : null}
      {error ? <p className="pet-qa-error" role="alert">{error}</p> : null}
      <form onSubmit={submit}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={800}
          placeholder="问小白一个和主人简历相关的问题"
          aria-label="宠物 QA 问题"
        />
        <button type="submit" disabled={pending || !question.trim()}>
          {pending ? "回答中" : "发送"}
        </button>
      </form>
    </aside>
  );
}
