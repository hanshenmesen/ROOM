import type { ParsedProfile, ProfileItem } from "./types.ts";

export type ProjectEdit = {
  title: string;
  summary: string;
  imageUrl?: string;
  projectUrl?: string;
};

export type ProjectEdits = Record<string, ProjectEdit>;

export function projectEditFromItem(item: ProfileItem): ProjectEdit {
  return {
    title: item.title,
    summary: item.summary,
    imageUrl: item.imageUrl,
    projectUrl: item.projectUrl || item.sourceUrl,
  };
}

export function applyProjectEdits(profile: ParsedProfile, edits: ProjectEdits): ParsedProfile {
  if (!Object.keys(edits).length) return profile;
  let changed = false;
  const items = profile.items.map((item) => {
    if (item.kind !== "project") return item;
    const edit = edits[item.id];
    if (!edit) return item;
    changed = true;
    return {
      ...item,
      title: edit.title.trim() || item.title,
      summary: edit.summary.trim() || item.summary,
      imageUrl: edit.imageUrl || undefined,
      projectUrl: edit.projectUrl?.trim() || undefined,
    };
  });
  return changed ? { ...profile, items } : profile;
}

export function updateProjectEdit(edits: ProjectEdits, itemId: string, edit: ProjectEdit): ProjectEdits {
  return {
    ...edits,
    [itemId]: {
      title: edit.title.trim(),
      summary: edit.summary.trim(),
      imageUrl: edit.imageUrl || undefined,
      projectUrl: edit.projectUrl?.trim() || undefined,
    },
  };
}
