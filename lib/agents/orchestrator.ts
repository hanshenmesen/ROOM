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
  { id: "room-lobby", kind: "lobby", title: "Living Room", subtitle: "关于林澈与这栋房子", center: [0, 0, 2.15], size: [7, 0.3, 10] },
  { id: "room-projects", kind: "projects", title: "Project Atelier", subtitle: "左前 · 项目与作品", center: [-8.1, 0, 3.65], size: [8.2, 0.3, 6.7] },
  { id: "room-experience", kind: "experience", title: "Timeline Study", subtitle: "右前 · 经历与教育", center: [8.1, 0, 3.65], size: [8.2, 0.3, 6.7] },
  { id: "room-skills", kind: "skills", title: "Tool Workshop", subtitle: "左后 · 能力与工具", center: [-8.1, 0, -3.55], size: [8.2, 0.3, 6.7] },
  { id: "room-achievements", kind: "achievements", title: "Signal Gallery", subtitle: "右后 · 成果与荣誉", center: [8.1, 0, -3.55], size: [8.2, 0.3, 6.7] },
];

function positionFor(center: Vec3, size: Vec3, index: number, count: number): Vec3 {
  const availableColumns = Math.max(2, Math.floor((size[0] - 1.2) / 1.9));
  const columns = count === 1 ? 1 : Math.min(count, availableColumns, 4);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const x = center[0] + (column - (columns - 1) / 2) * 1.95;
  const z = center[2] + (row - Math.max(0, Math.ceil(count / columns) - 1) / 2) * 1.55 + 0.45;
  return [x, 0.72, z];
}

function roomForItem(kind: string) {
  if (kind === "project") return "room-projects";
  if (kind === "experience" || kind === "education") return "room-experience";
  if (kind === "achievement") return "room-achievements";
  return "room-lobby";
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
      roomId: roomForItem(item.kind),
      title: item.title,
      eyebrow: item.kind.toUpperCase(),
      body: item.summary,
      tags: item.tags,
      kind: exhibitKind(item.kind),
      evidence: item.evidence,
    })),
    ...profile.skills.map((skill) => ({
      sourceItemId: `skill:${skill}`,
      roomId: "room-skills",
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
    const room = roomSpecs.find((item) => item.id === draft.roomId)!;
    return {
      id: `exhibit-${index + 1}`,
      ...draft,
      position: positionFor(room.center, room.size, siblingIndex, siblings.length),
      size: draft.kind === "terminal" ? [1.35, 0.75, 0.48] : [1.65, 1.05, 0.58],
      color: brief.palette.rooms[room.kind],
      interaction: {
        clickable: true,
        hitbox: [1.8, 1.4, 1.1],
        action: "open-detail",
      },
    };
  });

  const portals = [
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-projects", position: [-3.55, 1, 4.35] as Vec3, label: "Project Atelier" },
    { id: "portal-2", fromRoomId: "room-lobby", toRoomId: "room-experience", position: [3.55, 1, 4.35] as Vec3, label: "Timeline Study" },
    { id: "portal-3", fromRoomId: "room-lobby", toRoomId: "room-skills", position: [-3.55, 1, -1.05] as Vec3, label: "Tool Workshop" },
    { id: "portal-4", fromRoomId: "room-lobby", toRoomId: "room-achievements", position: [3.55, 1, -1.05] as Vec3, label: "Signal Gallery" },
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
      estimatedDrawCalls: 10 + rooms.length * 3 + exhibits.length * 2,
      estimatedTriangles: 8200 + exhibits.length * 720,
      realtimeLights: 3,
    },
  };
}
