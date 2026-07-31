import type {
  CreativeBrief,
  DisplaySurfacePlan,
  ExhibitPlan,
  ParsedProfile,
  RoomKind,
  RoomPlan,
  Vec3,
  WorldPlan,
} from "../types.ts";

const roomSpecs: Array<{
  id: string;
  kind: RoomKind;
  title: string;
  subtitle: string;
  center: Vec3;
  size: Vec3;
}> = [
  { id: "room-lobby", kind: "lobby", title: "客厅", subtitle: "人物、项目、能力与档案", center: [0, 0, -7], size: [21.6, 0.3, 28] },
  { id: "room-private", kind: "bedroom", title: "Private Upper Gallery", subtitle: "需密码进入 · 私人日记", center: [0, 3.53, -20], size: [10, 0.3, 12] },
];

function positionFor(center: Vec3, size: Vec3, index: number, count: number): Vec3 {
  const availableColumns = Math.max(2, Math.floor((size[0] - 2) / 2.3));
  const columns = count === 1 ? 1 : Math.min(count, availableColumns, 5);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCount = Math.ceil(count / columns);
  const centeredRow = row - (rowCount - 1) / 2;
  const reservedCenterOffset = centeredRow >= 0 ? centeredRow + 2 : centeredRow - 1;
  const entryClearanceShift = center[0] < -1 ? -1 : 0;
  const x = center[0] + entryClearanceShift + (column - (columns - 1) / 2) * 2.25;
  const z = center[2] + reservedCenterOffset * 3.7;
  // Semantic exhibits are presented by authored Mardou objects above the
  // project-island plane; keeping the planning metadata at that height also
  // prevents the checker from treating an index object as a project collision.
  return [x, 1.65, z];
}

function projectPosition(center: Vec3, index: number): Vec3 {
  const stations: Vec3[] = [
    [center[0] - 4, 0, center[2] + 4],
    [center[0] + 4, 0, center[2] + 4],
    [center[0] - 4, 0, center[2] - 4],
    [center[0] + 4, 0, center[2] - 4],
  ];
  if (stations[index]) return stations[index];

  const overflowIndex = index - stations.length;
  const column = overflowIndex % 4;
  const row = Math.floor(overflowIndex / 4);
  return [
    center[0] + (column - 1.5) * 3,
    0,
    center[2] - 7 - row * 2.5,
  ];
}

function exhibitKind(kind: string): ExhibitPlan["kind"] {
  if (kind === "project") return "pedestal";
  if (kind === "experience" || kind === "education") return "timeline";
  if (kind === "achievement") return "trophy";
  if (kind === "skill") return "terminal";
  return "panel";
}

type SurfaceDraft = {
  id: string;
  semanticRole: NonNullable<DisplaySurfacePlan["semanticRole"]>;
  title: string;
  kicker: string;
  accent: string;
  sourceItemIds: string[];
  presentationMode: DisplaySurfacePlan["presentationMode"];
  pageSize?: number;
  variant: NonNullable<DisplaySurfacePlan["layout"]>["variant"];
  weight: number;
};

function widthForSurface(draft: SurfaceDraft) {
  const base = draft.semanticRole === "profile" ? 4.75 : draft.semanticRole === "works" ? 4.1 : 3.35;
  const byContent = Math.min(1.2, Math.max(0, draft.sourceItemIds.length - 2) * 0.22);
  return Number(Math.min(5.05, base + byContent).toFixed(2));
}

function heightForSurface(draft: SurfaceDraft) {
  const base = draft.semanticRole === "profile" ? 2.18 : 1.72;
  const byContent = Math.min(0.48, Math.max(0, draft.sourceItemIds.length - 3) * 0.08);
  return Number(Math.min(2.28, base + byContent).toFixed(2));
}

function layoutDisplaySurfaces(drafts: SurfaceDraft[]): DisplaySurfacePlan[] {
  const rows = [
    drafts.filter((draft) => ["profile", "education", "experience"].includes(draft.semanticRole)),
    drafts.filter((draft) => ["achievement", "works", "skills", "contact"].includes(draft.semanticRole)),
  ].filter((row) => row.length);
  return rows.flatMap((row, rowIndex) => {
    const totalWidth = row.reduce((sum, draft) => sum + widthForSurface(draft), 0);
    const gap = row.length > 1 ? Math.min(0.58, Math.max(0.28, (15.8 - totalWidth) / (row.length - 1))) : 0;
    let cursor = -(totalWidth + gap * (row.length - 1)) / 2;
    const y = rowIndex === 0 ? 2.95 : 1.45;
    return row.map((draft) => {
      const width = widthForSurface(draft);
      const height = heightForSurface(draft);
      const x = Number((cursor + width / 2).toFixed(2));
      cursor += width + gap;
      return {
        id: draft.id,
        roomId: "room-lobby",
        semanticRole: draft.semanticRole,
        title: draft.title,
        kicker: draft.kicker,
        accent: draft.accent,
        sourceItemIds: draft.sourceItemIds,
        presentationMode: draft.presentationMode,
        pageSize: draft.pageSize,
        layout: {
          position: [x, y, -20.82] as Vec3,
          width,
          height,
          variant: draft.variant,
        },
        focusTarget: { target: [x, y, -20.82] as Vec3, camera: [x, Math.max(1.32, y - 0.68), -16.72] as Vec3, fov: rowIndex === 0 ? 46 : 48 },
        interaction: { clickable: true, action: "open-detail" as const },
      };
    });
  });
}

export function orchestrateWorld(profile: ParsedProfile, brief: CreativeBrief): WorldPlan {
  const draftedExhibits = [
    ...profile.items.map((item) => ({
      sourceItemId: item.id,
      roomId: "room-lobby",
      title: item.title,
      contentFamily: item.contentFamily,
      eyebrow: item.kind.toUpperCase(),
      body: item.summary,
      tags: item.tags,
      imageUrl: item.imageUrl,
      sourceUrl: item.sourceUrl,
      timeRange: item.timeRange,
      role: item.role,
      techStack: item.techStack,
      projectUrl: item.projectUrl,
      fieldEvidence: item.fieldEvidence,
      kind: exhibitKind(item.kind),
      evidence: item.evidence,
    })),
    ...profile.skills.map((skill) => ({
      sourceItemId: `skill:${skill}`,
      roomId: "room-lobby",
      title: skill,
      eyebrow: "SKILL",
      body: `${profile.name} 的履历中明确列出的能力。`,
      tags: [skill],
      kind: exhibitKind("skill"),
      evidence: profile.skillEvidence[skill] || [],
    })),
  ];
  const drafts = (() => {
    const seen = new Set<string>();
    return draftedExhibits.filter((draft) => {
      if (seen.has(draft.sourceItemId)) return false;
      seen.add(draft.sourceItemId);
      return true;
    });
  })();

  const nonProjectDrafts = drafts.filter((item) => item.eyebrow !== "PROJECT");
  const projectDrafts = drafts.filter((item) => item.eyebrow === "PROJECT");

  const exhibits: ExhibitPlan[] = drafts.map((draft, index) => {
    const siblings = draft.eyebrow === "PROJECT" ? projectDrafts : nonProjectDrafts;
    const siblingIndex = siblings.findIndex((item) => item.sourceItemId === draft.sourceItemId);
    const projectSiblings = projectDrafts;
    const projectIndex = projectSiblings.findIndex((item) => item.sourceItemId === draft.sourceItemId);
    const room = roomSpecs.find((item) => item.id === draft.roomId)!;
    return {
      id: `exhibit-${index + 1}`,
      ...draft,
      position: draft.eyebrow === "PROJECT"
        ? projectPosition(room.center, projectIndex)
        : positionFor(room.center, room.size, siblingIndex, siblings.length),
      size: draft.eyebrow === "PROJECT"
        ? [1.72, 1.72, 1.5]
        : draft.kind === "terminal"
          ? [0.72, 0.72, 0.48]
          : [0.82, 0.92, 0.52],
      color: brief.palette.rooms[room.kind],
      interaction: {
        clickable: true,
        hitbox: draft.eyebrow === "PROJECT" ? [1.92, 1.82, 1.7] : [1.05, 1.2, 0.9],
        action: "open-detail",
      },
    };
  });

  const portals = [
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-private", position: [2.5, 3.53, -15] as Vec3, label: "Private Upper Gallery" },
    { id: "portal-entrance", fromRoomId: "exterior", toRoomId: "room-lobby", position: [2, 1.5, 8] as Vec3, label: "Museum Entrance" },
  ];
  const rooms: RoomPlan[] = roomSpecs.map((room) => ({
    ...room,
    color: brief.palette.rooms[room.kind],
    portalIds: portals
      .filter((portal) => portal.fromRoomId === room.id || portal.toRoomId === room.id)
      .map((portal) => portal.id),
    exhibitIds: exhibits.filter((exhibit) => exhibit.roomId === room.id).map((exhibit) => exhibit.id),
  }));

  const sourceIdsFor = (...kinds: Array<ParsedProfile["items"][number]["kind"]>) =>
    profile.items.filter((item) => kinds.includes(item.kind)).map((item) => item.id);
  const projectSourceIds = sourceIdsFor("project");
  const achievementSourceIds = sourceIdsFor("achievement");
  const draftSurface = (surface: SurfaceDraft) => surface;
  const educationSourceIds = sourceIdsFor("education");
  const experienceSourceIds = sourceIdsFor("experience");
  const surfaceDrafts: SurfaceDraft[] = [
    draftSurface({
      id: "showroom-profile",
      semanticRole: "profile" as const,
      title: profile.name,
      kicker: "个人介绍",
      accent: "#ff8b61",
      sourceItemIds: [
        ...sourceIdsFor("summary"),
        ...(["name", "headline", "location", "summary"] as const)
          .filter((field) => profile.identityEvidence[field]?.length)
          .map((field) => `identity:${field}`),
      ],
      presentationMode: "summary" as const,
      variant: "profile" as const,
      weight: 1,
    }),
    ...(educationSourceIds.length ? [draftSurface({
      id: "showroom-education",
      semanticRole: "education" as const,
      title: `教育背景 · ${educationSourceIds.length}`,
      kicker: "教育背景",
      accent: "#d3aa54",
      sourceItemIds: educationSourceIds,
      presentationMode: "summary" as const,
      variant: "timeline" as const,
      weight: 2,
    })] : []),
    ...(experienceSourceIds.length ? [draftSurface({
      id: "showroom-experience",
      semanticRole: "experience" as const,
      title: `工作经验 · ${experienceSourceIds.length}`,
      kicker: "工作经验",
      accent: "#7088d4",
      sourceItemIds: experienceSourceIds,
      presentationMode: "summary" as const,
      variant: "timeline" as const,
      weight: 3,
    })] : []),
    ...(achievementSourceIds.length ? [draftSurface({
      id: "showroom-highlights",
      semanticRole: "achievement" as const,
      title: `成果与成就 · ${achievementSourceIds.length}`,
      kicker: "成果成就",
      accent: "#d3aa54",
      sourceItemIds: achievementSourceIds,
      presentationMode: achievementSourceIds.length > 6 ? "paged" as const : "summary" as const,
      pageSize: achievementSourceIds.length > 6 ? 6 : undefined,
      variant: "timeline" as const,
      weight: 4,
    })] : []),
    ...(projectSourceIds.length ? [draftSurface({
      id: "showroom-works",
      semanticRole: "works" as const,
      title: `项目与作品 · ${projectSourceIds.length}`,
      kicker: "作品索引",
      accent: "#8d77bf",
      sourceItemIds: projectSourceIds,
      presentationMode: projectSourceIds.length > 6 ? "paged" as const : "summary" as const,
      pageSize: projectSourceIds.length > 6 ? 6 : undefined,
      variant: "timeline" as const,
      weight: 5,
    })] : []),
    ...(profile.skills.length ? [draftSurface({
      id: "showroom-skills",
      semanticRole: "skills" as const,
      title: `技能工具 · ${profile.skills.length}`,
      kicker: "技能工具",
      accent: "#65d7c3",
      sourceItemIds: profile.skills.map((skill) => `skill:${skill}`),
      presentationMode: profile.skills.length > 10 ? "paged" as const : "summary" as const,
      pageSize: profile.skills.length > 10 ? 10 : undefined,
      variant: "skills" as const,
      weight: 6,
    })] : []),
    ...(profile.contacts.length ? [draftSurface({
      id: "showroom-contact",
      semanticRole: "contact" as const,
      title: `联系方式 · ${profile.contacts.length}`,
      kicker: "联系方式",
      accent: "#9fc6b8",
      sourceItemIds: profile.contacts.map((_, index) => `contact:${index + 1}`),
      presentationMode: profile.contacts.length > 5 ? "paged" as const : "summary" as const,
      pageSize: profile.contacts.length > 5 ? 5 : undefined,
      variant: "timeline" as const,
      weight: 7,
    })] : []),
  ].sort((a, b) => a.weight - b.weight);
  const displaySurfaces = layoutDisplaySurfaces(surfaceDrafts);

  return {
    version: "0.1.0",
    id: `world-${profile.id}`,
    profile,
    brief,
    rooms,
    portals,
    exhibits,
    displaySurfaces,
    tour: rooms.map((room) => ({
      roomId: room.id,
      label: room.title,
      camera: [room.center[0] + 6.8, 7.2, room.center[2] + 8.2],
    })),
    metrics: {
      rooms: rooms.length,
      exhibits: exhibits.length,
      estimatedDrawCalls: 18 + rooms.length * 5 + exhibits.length,
      estimatedTriangles: 94_000 + exhibits.length * 520,
      realtimeLights: 3,
    },
  };
}
