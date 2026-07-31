import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PORTRAIT_ART_BASE_URL,
  DEFAULT_PORTRAIT_ART_MODEL,
  extractPortraitImageBase64,
  getPortraitArtConfig,
  PORTRAIT_ART_PROMPT,
  portraitArtProviderError,
} from "../lib/portrait-art.ts";

test("portrait art prompt requires playful facial cues without realistic anatomy", () => {
  assert.match(PORTRAIT_ART_PROMPT, /playful, highly abstract black-and-white line-art face/i);
  assert.match(PORTRAIT_ART_PROMPT, /open spiral loop/i);
  assert.match(PORTRAIT_ART_PROMPT, /long angular zigzag/i);
  assert.match(PORTRAIT_ART_PROMPT, /disconnected playful curves/i);
  assert.match(PORTRAIT_ART_PROMPT, /no anatomically correct eyes/i);
  assert.match(PORTRAIT_ART_PROMPT, /No color, gray, shading, gradients/i);
  assert.match(PORTRAIT_ART_PROMPT, /no text/i);
  assert.doesNotMatch(PORTRAIT_ART_PROMPT, /Picasso|Basquiat|Kusama/i);
});

test("portrait art config uses dedicated image settings before parser settings", () => {
  const config = getPortraitArtConfig({
    IMAGE_MAAS_API_KEY: "image-key",
    IMAGE_MAAS_BASE_URL: "https://images.example.test/custom/",
    IMAGE_MAAS_MODEL: "image-model",
    MAAS_API_KEY: "parser-key",
    MAAS_BASE_URL: "https://parser.example.test",
  });

  assert.equal(config.apiKey, "image-key");
  assert.equal(config.baseUrl, "https://images.example.test/custom");
  assert.equal(config.model, "image-model");
  assert.equal(config.endpoint, "https://images.example.test/custom/v1/images/edits");
});

test("portrait art config falls back to the shared MAAS key and safe defaults", () => {
  const config = getPortraitArtConfig({ MAAS_API_KEY: "shared-key" });

  assert.equal(config.apiKey, "shared-key");
  assert.equal(config.baseUrl, DEFAULT_PORTRAIT_ART_BASE_URL);
  assert.equal(config.model, DEFAULT_PORTRAIT_ART_MODEL);
  assert.equal(config.endpoint, `${DEFAULT_PORTRAIT_ART_BASE_URL}/v1/images/edits`);
});

test("extracts only the first provider base64 image", () => {
  assert.equal(extractPortraitImageBase64({ data: [{ b64_json: "first" }, { b64_json: "second" }] }), "first");
  assert.equal(extractPortraitImageBase64({ data: [{ url: "https://example.test/image.png" }] }), "");
  assert.equal(extractPortraitImageBase64(null), "");
});

test("sanitizes provider error messages to a bounded string", () => {
  assert.equal(portraitArtProviderError({ error: { message: "bad request" } }, "fallback"), "bad request");
  assert.equal(portraitArtProviderError({}, "fallback"), "fallback");
  assert.equal(portraitArtProviderError({ error: "x".repeat(300) }, "fallback").length, 240);
});
