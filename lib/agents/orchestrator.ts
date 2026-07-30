import type {
  CreativeBrief,
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
  { id: "room-private", kind: "bedroom", title: "Private Bedroom", subtitle: "需密码进入 · 私人日记", center: [-18.8, 0, -16.25], size: [16, 0.3, 20] },
];

function positionFor(center: Vec3, size: Vec3, index: number, count: number): Vec3 {
  const availableColumns = Math.max(2, Math.floor((size[0] - 2) / 2.3));
  const columns = count === 1 ? 1 : Math.min(count, availableColumns, 5);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCount = Math.ceil(count / columns);
  const centeredRow = row - (rowCount - 1) / 2;
  const reservedCenterOffset = centeredRow >= 0 ? centeredRow + 1 : centeredRow - 1;
  const entryClearanceShift = center[0] < -1 ? -1 : 0;
  const x = center[0] + entryClearanceShift + (column - (columns - 1) / 2) * 2.25;
  const z = center[2] + reservedCenterOffset * 3.7;
  return [x, 0.72, z];
}

function projectPosition(center: Vec3, index: number): Vec3 {
  const stations: Vec3[] = [
    [center[0] - 4.4, 0, center[2] + 2.5],
    [center[0] + 4.4, 0, center[2] + 2.5],
    [center[0] - 4.4, 0, center[2] - 4.5],
    [center[0] + 4.4, 0, center[2] - 4.5],
  ];
  return stations[index] || [center[0] + (index - 1.5) * 4, 0, center[2] - 4.5];
}

function exhibitKind(kind: string): ExhibitPlan["kind"] {
  if (kind === "project") return "pedestal";
  if (kind === "experience" || kind === "education") return "timeline";
  if (kind === "achievement") return "trophy";
  if (kind === "skill") return "terminal";
  return "panel";
}

export function orchestrateWorld(profile: ParsedProfile, brief: CreativeBrief): WorldPlan {
  const drafts = [
    ...profile.items.map((item) => ({
      sourceItemId: item.id,
      roomId: "room-lobby",
      title: item.title,
      eyebrow: item.kind.toUpperCase(),
      body: item.summary,
      tags: item.tags,
      imageUrl: item.imageUrl,
      sourceUrl: item.sourceUrl,
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

  const exhibits: ExhibitPlan[] = drafts.map((draft, index) => {
    const siblings = drafts.filter((item) => item.roomId === draft.roomId);
    const siblingIndex = siblings.findIndex((item) => item.sourceItemId === draft.sourceItemId);
    const projectSiblings = drafts.filter((item) => item.eyebrow === "PROJECT");
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
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-private", position: [-10.8, 1, -16.25] as Vec3, label: "Private Bedroom" },
  ];
  const rooms: RoomPlan[] = roomSpecs.map((room) => ({
    ...room,
    color: brief.palette.rooms[room.kind],
    portalIds: portals
      .filter((portal) => portal.fromRoomId === room.id || portal.toRoomId === room.id)
      .map((portal) => portal.id),
    exhibitIds: exhibits.filter((exhibit) => exhibit.roomId === room.id).map((exhibit) => exhibit.id),
  }));

  return {
    version: "0.1.0",
    id: `world-${profile.id}`,
    profile,
    brief,
    rooms,
    portals,
    exhibits,
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
