export const DIARY_STORAGE_KEY = "room:diary:v1";
export const MAX_DIARY_ENTRIES = 8;
export const MAX_DIARY_TEXT_LENGTH = 1200;
export const MAX_DIARY_IMAGE_BYTES = 1_000_000;

export type DiaryEntry = {
  id: string;
  text: string;
  imageDataUrl?: string;
  createdAt: string;
};

type DiaryEntryDraft = {
  id: string;
  text: string;
  imageDataUrl?: string;
  createdAt: string;
};

export function diaryEntryFromDraft(draft: DiaryEntryDraft): DiaryEntry | null {
  const text = draft.text.trim().slice(0, MAX_DIARY_TEXT_LENGTH);
  const imageDataUrl = draft.imageDataUrl || undefined;
  if (!text && !imageDataUrl) return null;
  return { id: draft.id, text, imageDataUrl, createdAt: draft.createdAt };
}

export function appendDiaryEntry(entries: DiaryEntry[], entry: DiaryEntry): DiaryEntry[] {
  return [...entries, entry].slice(-MAX_DIARY_ENTRIES);
}
