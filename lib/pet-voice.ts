export const PET_VOICE_STORAGE_KEY = "room:pet-voice:v1";
export const PET_TTS_SAMPLE_RATE = 24_000;
export const PET_TTS_MAX_TEXT_CHARACTERS = 2_400;

export const DEFAULT_PET_TTS_CONFIG = {
  enabled: true,
  url: "wss://joiagent.devops.beta.xiaohongshu.com/tts/qwen3cus/v1/audio/speech/stream",
  model: "Qwen3-TTS-12Hz-1.7B-CustomVoice",
  voice: "vivian",
  taskType: "CustomVoice",
  language: "Auto",
  instructions: "Use a warm, curious, concise companion voice. Keep the delivery natural and friendly.",
  maxNewTokens: 1_024,
} as const;

export type PetVoicePreference = {
  enabled: boolean;
  volume: number;
};

export type PetTtsConfig = {
  enabled: boolean;
  url: string;
  model: string;
  voice: string;
  taskType: string;
  language: string;
  instructions: string;
  maxNewTokens: number;
};

export type PetTtsStreamState = "connecting" | "synthesizing" | "streaming" | "done";

type PetTtsStreamOptions = {
  text: string;
  config: PetTtsConfig;
  signal?: AbortSignal;
  onAudio: (chunk: Uint8Array<ArrayBuffer>) => void;
  onState?: (state: PetTtsStreamState) => void;
};

function cleanConfigText(value: unknown, fallback: string, maxLength = 240) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function normalizedTtsUrl(value: unknown) {
  const fallback = DEFAULT_PET_TTS_CONFIG.url;
  const raw = cleanConfigText(value, fallback, 2_000);
  try {
    const url = new URL(raw);
    const localDevelopment = url.protocol === "ws:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "wss:" && !localDevelopment) return fallback;
    if (url.username || url.password || url.hash) return fallback;
    if ([...url.searchParams.keys()].some((key) => /(?:api[-_]?key|auth|credential|secret|signature|token)/i.test(key))) {
      return fallback;
    }
    return url.href;
  } catch {
    return fallback;
  }
}

export function normalizePetVoicePreference(value: unknown): PetVoicePreference {
  const candidate = value && typeof value === "object" ? value as Partial<PetVoicePreference> : {};
  const volume = typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
    ? Math.min(1, Math.max(0, candidate.volume))
    : 0.88;
  return {
    enabled: candidate.enabled !== false,
    volume,
  };
}

export function normalizePetTtsConfig(value: Partial<PetTtsConfig> | undefined): PetTtsConfig {
  const candidate = value || {};
  const tokens = typeof candidate.maxNewTokens === "number" && Number.isFinite(candidate.maxNewTokens)
    ? Math.round(candidate.maxNewTokens)
    : DEFAULT_PET_TTS_CONFIG.maxNewTokens;
  return {
    enabled: candidate.enabled !== false,
    url: normalizedTtsUrl(candidate.url),
    model: cleanConfigText(candidate.model, DEFAULT_PET_TTS_CONFIG.model),
    voice: cleanConfigText(candidate.voice, DEFAULT_PET_TTS_CONFIG.voice, 120),
    taskType: cleanConfigText(candidate.taskType, DEFAULT_PET_TTS_CONFIG.taskType, 120),
    language: cleanConfigText(candidate.language, DEFAULT_PET_TTS_CONFIG.language, 80),
    instructions: cleanConfigText(candidate.instructions, DEFAULT_PET_TTS_CONFIG.instructions, 600),
    maxNewTokens: Math.min(4_096, Math.max(64, tokens)),
  };
}

export function petTtsConfigFromEnvironment(): PetTtsConfig {
  const enabledValue = process.env.NEXT_PUBLIC_PET_TTS_ENABLED?.trim().toLowerCase();
  const maxNewTokens = Number(process.env.NEXT_PUBLIC_PET_TTS_MAX_NEW_TOKENS);
  return normalizePetTtsConfig({
    enabled: !["0", "false", "off", "no"].includes(enabledValue || ""),
    url: process.env.NEXT_PUBLIC_PET_TTS_REALTIME_URL,
    model: process.env.NEXT_PUBLIC_PET_TTS_MODEL,
    voice: process.env.NEXT_PUBLIC_PET_TTS_VOICE,
    taskType: process.env.NEXT_PUBLIC_PET_TTS_TASK_TYPE,
    language: process.env.NEXT_PUBLIC_PET_TTS_LANGUAGE,
    instructions: process.env.NEXT_PUBLIC_PET_TTS_INSTRUCTIONS,
    maxNewTokens,
  });
}

export function splitPetTtsText(text: string, maxSegmentCharacters = 180) {
  const normalized = text.replace(/\s+/g, " ").trim().slice(0, PET_TTS_MAX_TEXT_CHARACTERS);
  if (!normalized) return [];
  const limit = Math.max(12, Math.floor(maxSegmentCharacters));
  const sentences = normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [normalized];
  const segments: string[] = [];
  let current = "";

  function flush() {
    const value = current.trim();
    if (value) segments.push(value);
    current = "";
  }

  for (const sentence of sentences) {
    const value = sentence.trim();
    if (!value) continue;
    if (value.length > limit) {
      flush();
      for (let index = 0; index < value.length; index += limit) {
        segments.push(value.slice(index, index + limit));
      }
      continue;
    }
    if (current && current.length + value.length > limit) flush();
    current += value;
  }
  flush();
  return segments;
}

export function buildPetTtsSessionConfig(config: PetTtsConfig) {
  return {
    type: "session.config",
    model: config.model,
    voice: config.voice,
    task_type: config.taskType,
    language: config.language,
    instructions: config.instructions,
    response_format: "pcm",
    stream_audio: true,
    split_granularity: "sentence",
    max_new_tokens: config.maxNewTokens,
  };
}

export function pcm16LeToFloat32(bytes: Uint8Array<ArrayBuffer>) {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getInt16(index * 2, true);
    samples[index] = sample < 0 ? sample / 32_768 : sample / 32_767;
  }
  return samples;
}

function upstreamErrorMessage(data: unknown) {
  if (typeof data !== "string") return "";
  try {
    const event = JSON.parse(data) as Record<string, unknown>;
    if (event.type !== "error") return "";
    const error = event.error;
    if (typeof error === "string") return error.slice(0, 300);
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") return message.slice(0, 300);
    }
    return "Qwen3-TTS 返回了错误。";
  } catch {
    return "";
  }
}

async function messageBytes(data: unknown): Promise<Uint8Array<ArrayBuffer> | null> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView<ArrayBuffer>;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  return null;
}

export async function streamPetTts({ text, config, signal, onAudio, onState }: PetTtsStreamOptions) {
  const segments = splitPetTtsText(text);
  if (!segments.length) throw new Error("没有可播放的回答文字。");
  if (!config.enabled) throw new Error("宠物语音功能已关闭。");

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(config.url);
    socket.binaryType = "arraybuffer";
    let settled = false;
    let receivedAudio = false;
    let audioDone = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const connectionTimer = setTimeout(() => fail(new Error("Qwen3-TTS 连接超时。")), 12_000);

    function clearTimers() {
      clearTimeout(connectionTimer);
      if (idleTimer) clearTimeout(idleTimer);
    }

    function armIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail(new Error("Qwen3-TTS 长时间没有返回音频。")), 60_000);
    }

    function closeSocket() {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close(1_000, "room-pet-voice-finished");
      }
    }

    function finish() {
      if (settled) return;
      settled = true;
      clearTimers();
      signal?.removeEventListener("abort", abort);
      closeSocket();
      onState?.("done");
      resolve();
    }

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimers();
      signal?.removeEventListener("abort", abort);
      closeSocket();
      reject(error);
    }

    function abort() {
      fail(new DOMException("语音播放已取消。", "AbortError"));
    }

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    onState?.("connecting");

    socket.addEventListener("open", () => {
      clearTimeout(connectionTimer);
      armIdleTimer();
      onState?.("synthesizing");
      socket.send(JSON.stringify(buildPetTtsSessionConfig(config)));
      for (const segment of segments) {
        socket.send(JSON.stringify({ type: "input.text", text: segment }));
      }
      socket.send(JSON.stringify({ type: "input.done" }));
    });

    socket.addEventListener("message", (event) => {
      armIdleTimer();
      if (typeof event.data === "string") {
        const error = upstreamErrorMessage(event.data);
        if (error) {
          fail(new Error(error));
          return;
        }
        try {
          const payload = JSON.parse(event.data) as { type?: string };
          if (payload.type === "audio.done") audioDone = true;
          if (payload.type === "session.done") {
            if (receivedAudio) finish();
            else fail(new Error("Qwen3-TTS 已结束，但没有返回可播放的音频。"));
          }
        } catch {
          // Unknown text events are informational and do not affect PCM playback.
        }
        return;
      }
      void messageBytes(event.data).then((bytes) => {
        if (!bytes?.byteLength || settled) return;
        receivedAudio = true;
        onState?.("streaming");
        onAudio(bytes);
      }).catch(() => fail(new Error("无法读取 Qwen3-TTS 音频帧。")));
    });

    socket.addEventListener("error", () => fail(new Error("无法连接 Qwen3-TTS 实时语音服务。")));
    socket.addEventListener("close", (event) => {
      if (settled) return;
      if (receivedAudio && audioDone && event.code === 1_000) finish();
      else fail(new Error(`Qwen3-TTS 连接已断开${event.code ? `（${event.code}）` : ""}。`));
    });
  });
}

export class PetPcmPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private scheduledUntil = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private drainWaiters = new Set<() => void>();
  private volume = 0.88;
  private pendingPcmByte: number | null = null;

  async unlock() {
    if (!this.context) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new Error("当前浏览器不支持 Web Audio。");
      this.context = new AudioCtor({ sampleRate: PET_TTS_SAMPLE_RATE });
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
  }

  enqueue(bytes: Uint8Array<ArrayBuffer>) {
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain || !bytes.byteLength) return;
    let alignedBytes = new Uint8Array(bytes);
    if (this.pendingPcmByte !== null) {
      const combined = new Uint8Array(alignedBytes.byteLength + 1);
      combined[0] = this.pendingPcmByte;
      combined.set(alignedBytes, 1);
      alignedBytes = combined;
      this.pendingPcmByte = null;
    }
    if (alignedBytes.byteLength % 2 === 1) {
      this.pendingPcmByte = alignedBytes[alignedBytes.byteLength - 1];
      alignedBytes = alignedBytes.slice(0, -1);
    }
    if (alignedBytes.byteLength < 2) return;
    const samples = pcm16LeToFloat32(alignedBytes);
    if (!samples.length) return;
    const audioBuffer = context.createBuffer(1, samples.length, PET_TTS_SAMPLE_RATE);
    audioBuffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gain);
    const startAt = Math.max(context.currentTime + 0.025, this.scheduledUntil);
    this.scheduledUntil = startAt + audioBuffer.duration;
    this.sources.add(source);
    source.addEventListener("ended", () => {
      this.sources.delete(source);
      if (!this.sources.size) this.resolveDrainWaiters();
    }, { once: true });
    source.start(startAt);
  }

  async whenDrained() {
    if (!this.sources.size) return;
    await new Promise<void>((resolve) => this.drainWaiters.add(resolve));
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already-finished sources can be ignored.
      }
    }
    this.sources.clear();
    this.scheduledUntil = this.context?.currentTime || 0;
    this.pendingPcmByte = null;
    this.resolveDrainWaiters();
  }

  dispose() {
    this.stop();
    const context = this.context;
    this.context = null;
    this.gain = null;
    if (context && context.state !== "closed") void context.close();
  }

  private resolveDrainWaiters() {
    for (const resolve of this.drainWaiters) resolve();
    this.drainWaiters.clear();
  }
}
