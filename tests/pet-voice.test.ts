import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_PET_TTS_CONFIG,
  PET_TTS_SAMPLE_RATE,
  PET_VOICE_STORAGE_KEY,
  buildPetTtsSessionConfig,
  normalizePetTtsConfig,
  normalizePetVoicePreference,
  pcm16LeToFloat32,
  petTtsConfigFromEnvironment,
  splitPetTtsText,
  streamPetTts,
} from "../lib/pet-voice.ts";

const panelSource = await readFile(new URL("../components/PetQaPanel.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const voiceSource = await readFile(new URL("../lib/pet-voice.ts", import.meta.url), "utf8");

test("pet voice defaults to Qwen3 realtime PCM with a bounded local preference", () => {
  assert.equal(PET_VOICE_STORAGE_KEY, "room:pet-voice:v1");
  assert.equal(PET_TTS_SAMPLE_RATE, 24_000);
  assert.equal(DEFAULT_PET_TTS_CONFIG.voice, "vivian");
  // No default endpoint is tracked; local runs inject NEXT_PUBLIC_PET_TTS_REALTIME_URL.
  assert.equal(DEFAULT_PET_TTS_CONFIG.url, "");
  assert.deepEqual(normalizePetVoicePreference(null), { enabled: true, volume: 0.88 });
  assert.deepEqual(normalizePetVoicePreference({ enabled: false, volume: 7 }), { enabled: false, volume: 1 });
});

test("pet TTS config rejects unsafe websocket URLs and permits local development", () => {
  assert.equal(normalizePetTtsConfig({ url: "ws://public.example.test/stream" }).url, DEFAULT_PET_TTS_CONFIG.url);
  assert.equal(normalizePetTtsConfig({ url: "wss://user:secret@example.test/stream" }).url, DEFAULT_PET_TTS_CONFIG.url);
  assert.equal(normalizePetTtsConfig({ url: "wss://example.test/stream?access_token=secret" }).url, DEFAULT_PET_TTS_CONFIG.url);
  assert.equal(normalizePetTtsConfig({ url: "ws://localhost:9000/stream" }).url, "ws://localhost:9000/stream");
  assert.equal(normalizePetTtsConfig({ maxNewTokens: 99_999 }).maxNewTokens, 4_096);
});

test("pet TTS environment accepts common off values and a bounded token limit", () => {
  const previousEnabled = process.env.NEXT_PUBLIC_PET_TTS_ENABLED;
  const previousTokens = process.env.NEXT_PUBLIC_PET_TTS_MAX_NEW_TOKENS;
  try {
    process.env.NEXT_PUBLIC_PET_TTS_ENABLED = "false";
    process.env.NEXT_PUBLIC_PET_TTS_MAX_NEW_TOKENS = "99999";
    const config = petTtsConfigFromEnvironment();
    assert.equal(config.enabled, false);
    assert.equal(config.maxNewTokens, 4_096);
  } finally {
    if (previousEnabled === undefined) delete process.env.NEXT_PUBLIC_PET_TTS_ENABLED;
    else process.env.NEXT_PUBLIC_PET_TTS_ENABLED = previousEnabled;
    if (previousTokens === undefined) delete process.env.NEXT_PUBLIC_PET_TTS_MAX_NEW_TOKENS;
    else process.env.NEXT_PUBLIC_PET_TTS_MAX_NEW_TOKENS = previousTokens;
  }
});

test("pet answers are segmented on sentence boundaries before incremental TTS input", () => {
  const segments = splitPetTtsText("第一句很短。第二句也很短！第三句继续说明项目经历。", 14);
  assert.deepEqual(segments, ["第一句很短。第二句也很短！", "第三句继续说明项目经历。"]);
  assert.equal(segments.join(""), "第一句很短。第二句也很短！第三句继续说明项目经历。");
  assert.equal(splitPetTtsText("   ").length, 0);
});

test("Qwen3 session requests stream sentence-split PCM audio", () => {
  const config = normalizePetTtsConfig(undefined);
  assert.deepEqual(buildPetTtsSessionConfig(config), {
    type: "session.config",
    model: DEFAULT_PET_TTS_CONFIG.model,
    voice: "vivian",
    task_type: "CustomVoice",
    language: "Auto",
    instructions: DEFAULT_PET_TTS_CONFIG.instructions,
    response_format: "pcm",
    stream_audio: true,
    split_granularity: "sentence",
    max_new_tokens: 1_024,
  });
});

test("PCM16 little-endian frames convert to normalized Web Audio samples", () => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setInt16(0, -32_768, true);
  view.setInt16(2, -1, true);
  view.setInt16(4, 0, true);
  view.setInt16(6, 32_767, true);
  const samples = pcm16LeToFloat32(new Uint8Array(buffer));
  assert.equal(samples[0], -1);
  assert.ok(samples[1] < 0 && samples[1] > -0.001);
  assert.equal(samples[2], 0);
  assert.equal(samples[3], 1);
});

test("a completed Qwen3 session without PCM is treated as a recoverable failure", async () => {
  const OriginalWebSocket = globalThis.WebSocket;
  class NoAudioWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    readyState = NoAudioWebSocket.CONNECTING;
    binaryType = "";

    constructor() {
      super();
      queueMicrotask(() => {
        this.readyState = NoAudioWebSocket.OPEN;
        this.dispatchEvent(new Event("open"));
      });
    }

    send(value: string) {
      if ((JSON.parse(value) as { type?: string }).type !== "input.done") return;
      setTimeout(() => {
        this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ type: "session.done" }),
        }));
      }, 0);
    }

    close() {
      this.readyState = NoAudioWebSocket.CLOSED;
    }
  }

  globalThis.WebSocket = NoAudioWebSocket as unknown as typeof WebSocket;
  try {
    await assert.rejects(
      streamPetTts({
        text: "没有音频的回答。",
        config: normalizePetTtsConfig({ url: "wss://tts.example.test/stream" }),
        onAudio: () => assert.fail("should not receive audio"),
      }),
      /没有返回可播放的音频/,
    );
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
  }
});

test("pet QA exposes automatic voice, replay, stop, fallback, and ambient ducking", () => {
  assert.match(panelSource, /<h2>\{companionName\}<\/h2>/);
  assert.match(panelSource, /我是\{companionName\}/);
  assert.match(panelSource, /aria-label="宠物语音控制"/);
  assert.match(panelSource, /aria-pressed=\{voicePreference\.enabled\}/);
  assert.match(panelSource, /disabled=\{!ttsConfig\.enabled\}/);
  assert.match(panelSource, /语音未配置/);
  assert.match(panelSource, />重播<\/button>/);
  assert.match(panelSource, /disabled=\{pending \|\| speechActive\}/);
  assert.match(panelSource, /aria-label="停止宠物语音"/);
  assert.match(panelSource, /SpeechSynthesisUtterance/);
  assert.match(panelSource, /localStorage\.setItem\(PET_VOICE_STORAGE_KEY/);
  assert.match(voiceSource, /binaryType = "arraybuffer"/);
  assert.match(voiceSource, /type: "input\.text"/);
  assert.match(voiceSource, /type: "input\.done"/);
  assert.match(voiceSource, /createBuffer\(1, samples\.length, PET_TTS_SAMPLE_RATE\)/);
  assert.match(voiceSource, /pendingPcmByte/);
  assert.match(studioSource, /handlePetSpeechStart[\s\S]{0,180}musicController\.current\?\.stop\(\)/);
  assert.match(studioSource, /handlePetSpeechEnd[\s\S]{0,240}musicController\.current\?\.start\(\)/);
  assert.match(studioSource, /petSpeechActive[\s\S]{0,180}Math\.min\(gramophoneVolume, 0\.12\)/);
});
