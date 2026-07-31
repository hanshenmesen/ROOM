export const DEFAULT_PORTRAIT_ART_BASE_URL = "https://maas.devops.rednote.life/hackson";
export const DEFAULT_PORTRAIT_ART_MODEL = "gpt-image-2";
export const MAX_PORTRAIT_SOURCE_BYTES = 8 * 1024 * 1024;

export const PORTRAIT_ART_PROMPT = `Use Image 1 only as a loose source of pose rhythm, head silhouette, hair mass, and shoulder direction.

Create a playful, highly abstract black-and-white line-art face inspired by that source. It must read first as experimental abstract drawing, never as a realistic portrait, photograph, conventional face illustration, or clean vector avatar. Allow the source to echo only through the overall energy and broken outer contour.

Art direction: warm white paper background; roughly 16–24 expressive black ink strokes; varied line weight; continuous, broken, looping, angular, and floating marks; lively visual rhythm; generous untouched negative space. Use only pure black ink and warm white. No color, gray, shading, gradients, realistic texture, paint fill, or photographic detail.

Composition: square and asymmetrical. Build an incomplete head contour from displaced segments. Suggest one eye with an open spiral loop and the other with a single tilted arc placed intentionally out of alignment. Suggest the nose with one long angular zigzag that crosses the center. Suggest the mouth with two disconnected playful curves shifted slightly off-center. Add two or three free loops that escape the silhouette. These marks should evoke a face while remaining obviously non-anatomical, deconstructed, surprising, and fun.

Hard constraints: no anatomically correct eyes, pupils, eyebrows, nostrils, lips, ears, skin, or hair strands. No symmetrical facial layout, realistic proportions, complete face, or literal human rendering. Do not preserve photographic detail. No filled facial planes or extra people. No text, logo, watermark, decorative border, celebrity substitution, or horror imagery.`;

type PortraitArtEnvironment = Record<string, string | undefined>;

export type PortraitArtConfigOverride = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function getPortraitArtConfig(
  environment: PortraitArtEnvironment = process.env,
  override?: PortraitArtConfigOverride,
) {
  const apiKey = override
    ? override.apiKey.trim()
    : (
        environment.IMAGE_MAAS_API_KEY
        || environment.MAAS_IMAGE_API_KEY
        || environment.MAAS_API_KEY
        || ""
      ).trim();
  const baseUrl = (override
    ? override.baseUrl
    : environment.IMAGE_MAAS_BASE_URL
      || environment.MAAS_IMAGE_BASE_URL
      || environment.MAAS_BASE_URL
      || DEFAULT_PORTRAIT_ART_BASE_URL
  ).trim().replace(/\/+$/, "");
  const model = (override
    ? override.model
    : environment.IMAGE_MAAS_MODEL
      || environment.MAAS_IMAGE_MODEL
      || DEFAULT_PORTRAIT_ART_MODEL
  ).trim();

  return {
    apiKey,
    baseUrl,
    model,
    endpoint: `${baseUrl}${baseUrl.endsWith("/v1") ? "" : "/v1"}/images/edits`,
  };
}

export function extractPortraitImageBase64(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || !data.length) return "";
  const image = data[0];
  if (!image || typeof image !== "object") return "";
  const encoded = (image as { b64_json?: unknown }).b64_json;
  return typeof encoded === "string" ? encoded : "";
}

export function decodeBase64Image(encoded: string) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function portraitArtProviderError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 240);
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
  }
  return fallback;
}
