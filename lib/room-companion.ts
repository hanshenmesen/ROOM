export const ROOM_COMPANION_NAME = "小白";
export const ROOM_COMPANION_NAME_MAX_LENGTH = 12;

export function cleanRoomCompanionName(value: unknown) {
  if (typeof value !== "string") return "";
  return [...value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}·._\-]/gu, "")
    .trim()]
    .slice(0, ROOM_COMPANION_NAME_MAX_LENGTH)
    .join("");
}

export function normalizeRoomCompanionName(value: unknown) {
  return cleanRoomCompanionName(value) || ROOM_COMPANION_NAME;
}
