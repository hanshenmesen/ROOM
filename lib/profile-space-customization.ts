import { normalizeRoomCompanionName, ROOM_COMPANION_NAME } from "./room-companion.ts";

export const PROFILE_SPACE_STORAGE_PREFIX = "room:profile-space:v1:";
export const LEGACY_PRIVATE_FRAME_STORAGE_KEY = "room:mardou-private-frame-images:v2";

export const PRIVATE_FRAME_SLOTS = [
  "private-frame-1",
  "private-frame-2",
  "private-frame-3",
  "private-frame-4",
  "private-frame-5",
  "private-frame-6",
] as const;

export type PrivateFrameSlot = typeof PRIVATE_FRAME_SLOTS[number];
export type PrivateFrameImages = Partial<Record<PrivateFrameSlot, string>>;

export const PET_BODY_COLORS = [
  { value: "#d8c7a7", label: "燕麦" },
  { value: "#f0e5d2", label: "奶油" },
  { value: "#b98768", label: "焦糖" },
  { value: "#8795a1", label: "雾蓝" },
  { value: "#c7a7bd", label: "莓灰" },
] as const;

export const PET_ACCENT_COLORS = [
  { value: "#6fd6c9", label: "薄荷" },
  { value: "#ef7c63", label: "珊瑚" },
  { value: "#e6b84f", label: "蜂蜜" },
  { value: "#7387d8", label: "矢车菊" },
  { value: "#9a72bd", label: "鸢尾" },
] as const;

export const PET_EAR_STYLES = [
  { value: "pointed", label: "机灵尖耳" },
  { value: "round", label: "柔软圆耳" },
  { value: "droop", label: "放松垂耳" },
] as const;

export const PET_MARKING_STYLES = [
  { value: "none", label: "干净脸" },
  { value: "mask", label: "眼罩纹" },
  { value: "star", label: "星点纹" },
] as const;

export const PET_PERSONALITIES = [
  { value: "warm", label: "温暖", description: "耐心、关照感强" },
  { value: "playful", label: "活泼", description: "轻快、带一点幽默" },
  { value: "calm", label: "沉静", description: "简洁、不急不躁" },
  { value: "curious", label: "好奇", description: "鼓励探索和追问" },
] as const;

export type PetBodyColor = typeof PET_BODY_COLORS[number]["value"];
export type PetAccentColor = typeof PET_ACCENT_COLORS[number]["value"];
export type PetEarStyle = typeof PET_EAR_STYLES[number]["value"];
export type PetMarkingStyle = typeof PET_MARKING_STYLES[number]["value"];
export type PetPersonality = typeof PET_PERSONALITIES[number]["value"];

export type PetCustomization = {
  name: string;
  bodyColor: PetBodyColor;
  accentColor: PetAccentColor;
  earStyle: PetEarStyle;
  markingStyle: PetMarkingStyle;
  personality: PetPersonality;
};

export type ProfileSpaceCustomization = {
  version: 1;
  profileId: string;
  pet: PetCustomization;
  frameImages: PrivateFrameImages;
};

export const DEFAULT_PET_CUSTOMIZATION: PetCustomization = {
  name: ROOM_COMPANION_NAME,
  bodyColor: PET_BODY_COLORS[0].value,
  accentColor: PET_ACCENT_COLORS[0].value,
  earStyle: PET_EAR_STYLES[0].value,
  markingStyle: PET_MARKING_STYLES[0].value,
  personality: PET_PERSONALITIES[0].value,
};

const PET_PERSONALITY_TONE: Record<PetPersonality, string> = {
  warm: "Use a warm, reassuring, and patient response tone.",
  playful: "Use a lively, lightly humorous, and friendly response tone.",
  calm: "Use a calm, concise, and unhurried response tone.",
  curious: "Use a curious, encouraging response tone that invites gentle follow-up questions.",
};

function allowedValue<T extends string>(value: unknown, choices: readonly { value: T }[], fallback: T): T {
  return typeof value === "string" && choices.some((choice) => choice.value === value)
    ? value as T
    : fallback;
}

export function normalizePetPersonality(value: unknown): PetPersonality {
  return allowedValue(value, PET_PERSONALITIES, DEFAULT_PET_CUSTOMIZATION.personality);
}

export function petPersonalityToneInstruction(value: unknown) {
  return PET_PERSONALITY_TONE[normalizePetPersonality(value)];
}

export function normalizePetCustomization(value: unknown): PetCustomization {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    name: normalizeRoomCompanionName(record.name),
    bodyColor: allowedValue(record.bodyColor, PET_BODY_COLORS, DEFAULT_PET_CUSTOMIZATION.bodyColor),
    accentColor: allowedValue(record.accentColor, PET_ACCENT_COLORS, DEFAULT_PET_CUSTOMIZATION.accentColor),
    earStyle: allowedValue(record.earStyle, PET_EAR_STYLES, DEFAULT_PET_CUSTOMIZATION.earStyle),
    markingStyle: allowedValue(record.markingStyle, PET_MARKING_STYLES, DEFAULT_PET_CUSTOMIZATION.markingStyle),
    personality: normalizePetPersonality(record.personality),
  };
}

export function normalizePrivateFrameImages(value: unknown): PrivateFrameImages {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    PRIVATE_FRAME_SLOTS
      .map((slot) => [slot, (value as Record<string, unknown>)[slot]] as const)
      .filter((entry): entry is readonly [PrivateFrameSlot, string] => (
        typeof entry[1] === "string" && /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(entry[1])
      )),
  );
}

export function profileSpaceStorageKey(profileId: string) {
  return `${PROFILE_SPACE_STORAGE_PREFIX}${encodeURIComponent(profileId)}`;
}

export function defaultProfileSpaceCustomization(profileId: string): ProfileSpaceCustomization {
  return {
    version: 1,
    profileId,
    pet: { ...DEFAULT_PET_CUSTOMIZATION },
    frameImages: {},
  };
}

export function normalizeProfileSpaceCustomization(
  value: unknown,
  profileId: string,
): ProfileSpaceCustomization {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (record.profileId !== profileId || record.version !== 1) {
    return defaultProfileSpaceCustomization(profileId);
  }
  return {
    version: 1,
    profileId,
    pet: normalizePetCustomization(record.pet),
    frameImages: normalizePrivateFrameImages(record.frameImages),
  };
}
