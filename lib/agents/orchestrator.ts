import type {
  CreativeBrief,
  ExhibitPlan,
  ParsedProfile,
  RoomKind,
  RoomPlan,
  Vec3,
  WorldPlan,
} from "../types.ts";
import { MUSEUM_LAYOUT, museumExhibitPosition, museumProjectPosition } from "../museum-layout.ts";

const roomSpecs: Array<{
  id: string;
  kind: RoomKind;
  title: string;
  subtitle: string;
  center: Vec3;
  size: Vec3;
}> = [
  { id: "room-lobby", kind: "lobby", title: "Museum Ground Floor", subtitle: "人物、项目、能力与档案", center: MUSEUM_LAYOUT.bounds.groundCenter, size: MUSEUM_LAYOUT.bounds.groundSize },
  { id: "room-private", kind: "bedroom", title: "Second-floor Private Bedroom", subtitle: "需密码进入 · 私人日记", center: MUSEUM_LAYOUT.bounds.privateCenter, size: MUSEUM_LAYOUT.bounds.privateSize },
];

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
        ? museumProjectPosition(projectIndex)
        : museumExhibitPosition(siblingIndex),
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
    { id: "portal-1", fromRoomId: "room-lobby", toRoomId: "room-private", position: MUSEUM_LAYOUT.portal as Vec3, label: "Second-floor Private Bedroom" },
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
      camera: room.kind === "bedroom"
        ? MUSEUM_LAYOUT.camera.privateRoom.position
        : MUSEUM_LAYOUT.camera.ground.position,
    })),
    metrics: {
      rooms: rooms.length,
      exhibits: exhibits.length,
      estimatedDrawCalls: 30 + exhibits.length,
      estimatedTriangles: 73_800 + exhibits.length * 320,
      realtimeLights: 4,
    },
  };
}
