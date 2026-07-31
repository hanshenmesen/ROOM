import type {
  CreativeBrief,
  ExhibitPlan,
  ParsedProfile,
  RoomKind,
  RoomPlan,
  Vec3,
  WorldPlan,
} from "../types.ts";
import { FLOOR_HEIGHT, FLOOR_PORTAL_POSITION, PROJECT_ANCHORS } from "../museum-layout.ts";

const roomSpecs: Array<{
  id: string;
  kind: RoomKind;
  title: string;
  subtitle: string;
  center: Vec3;
  size: Vec3;
}> = [
  { id: "room-lobby", kind: "lobby", title: "一楼公共展厅", subtitle: "人物、项目、能力与档案", center: [0, 0, 0], size: [11.4, 4.25, 7.4] },
  { id: "room-private", kind: "bedroom", title: "二楼私人房间", subtitle: "需密码进入 · 私人日记", center: [0, FLOOR_HEIGHT, 0], size: [11.4, 4.25, 7.4] },
];

function positionFor(index: number): Vec3 {
  const columns = [-4.5, -2.7, -0.9, 0.9, 2.7, 4.5];
  const rows = [-2.72, -1.62, 1.62, 2.72];
  return [columns[index % columns.length], 1.45, rows[Math.floor(index / columns.length) % rows.length]];
}

function projectPosition(index: number): Vec3 {
  return PROJECT_ANCHORS[index]?.position || [0, 0, 0.45];
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
    const nonProjectSiblings = drafts.filter((item) => item.roomId === draft.roomId && item.eyebrow !== "PROJECT");
    const siblingIndex = nonProjectSiblings.findIndex((item) => item.sourceItemId === draft.sourceItemId);
    const projectSiblings = drafts.filter((item) => item.eyebrow === "PROJECT");
    const projectIndex = projectSiblings.findIndex((item) => item.sourceItemId === draft.sourceItemId);
    const room = roomSpecs.find((item) => item.id === draft.roomId)!;
    return {
      id: `exhibit-${index + 1}`,
      ...draft,
      position: draft.eyebrow === "PROJECT"
        ? projectPosition(projectIndex)
        : positionFor(siblingIndex),
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
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-private", position: FLOOR_PORTAL_POSITION as Vec3, label: "2F Private Room" },
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
      camera: [0, room.center[1] + 1.62, 3.05],
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
