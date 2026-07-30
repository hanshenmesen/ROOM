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
  { id: "room-lobby", kind: "lobby", title: "Living Room", subtitle: "关于林澈与这栋房子", center: [0, 0, 0], size: [10.8, 0.3, 14] },
  { id: "room-projects", kind: "projects", title: "Portfolio Room", subtitle: "四个精选项目", center: [-13.2, 0, -1], size: [15.5, 0.3, 14] },
];

function positionFor(center: Vec3, size: Vec3, index: number, count: number): Vec3 {
  const availableColumns = Math.max(2, Math.floor((size[0] - 2) / 2.3));
  const columns = count === 1 ? 1 : Math.min(count, availableColumns, 5);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const entryClearanceShift = center[0] < -1 ? -1 : 0;
  const x = center[0] + entryClearanceShift + (column - (columns - 1) / 2) * 2.25;
  const z = center[2] + (row - Math.max(0, Math.ceil(count / columns) - 1) / 2) * 2.05;
  return [x, 0.72, z];
}

function projectPosition(center: Vec3, index: number, count: number): Vec3 {
  const twoSidedStations: Vec3[] = [
    [center[0] + 3, 0.72, center[2] - 2.65],
    [center[0] + 0.6, 0.72, center[2] - 3.15],
    [center[0] + 3, 0.72, center[2] + 2.65],
    [center[0] + 0.6, 0.72, center[2] + 3.15],
  ];
  return twoSidedStations[index] || positionFor(center, [15.5, 0.3, 14], index, count);
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
      roomId: "room-projects",
      title: item.title,
      eyebrow: item.kind.toUpperCase(),
      body: item.summary,
      tags: item.tags,
      kind: exhibitKind(item.kind),
      evidence: item.evidence,
    })),
    ...profile.skills.map((skill) => ({
      sourceItemId: `skill:${skill}`,
      roomId: "room-projects",
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
        ? projectPosition(room.center, projectIndex, projectSiblings.length)
        : positionFor(room.center, room.size, siblingIndex, siblings.length),
      size: draft.kind === "terminal" ? [0.72, 0.72, 0.48] : [0.82, 0.92, 0.52],
      color: brief.palette.rooms[room.kind],
      interaction: {
        clickable: true,
        hitbox: [1.05, 1.2, 0.9],
        action: "open-detail",
      },
    };
  });

  const portals = [
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-projects", position: [-5.45, 1, -1] as Vec3, label: "Portfolio Room" },
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
