import { referenceCatalog, roomFirstReferenceIds } from "../rag/reference-catalog.ts";
import type { CreativeBrief, ParsedProfile, RetrievedReference } from "../types.ts";

const roomKeywords = ["room", "房间", "空间", "project", "项目", "gallery", "interactive"];

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((token) => token.length > 1);
}

export function directWorld(profile: ParsedProfile): CreativeBrief {
  const query = new Set(
    tokens(
      [profile.headline, profile.summary, profile.skills.join(" "), roomKeywords.join(" ")].join(" "),
    ),
  );
  const references: RetrievedReference[] = referenceCatalog
    .map((reference) => {
      const overlap = [...tokens(`${reference.tags.join(" ")} ${reference.patterns.join(" ")}`)].filter(
        (token) => query.has(token),
      ).length;
      const roomBoost = roomFirstReferenceIds.includes(reference.id) ? 5 : 0;
      const licenseBoost = reference.reuse === "approved" ? 3 : 0;
      const score = reference.similarity * 4 + roomBoost + licenseBoost + overlap;
      return {
        referenceId: reference.id,
        name: reference.name,
        score,
        reason: `${reference.category === "room" ? "房间叙事匹配" : "交互模式补充"} · ${reference.license}`,
        patterns: reference.patterns.slice(0, 2),
        reuse: reference.reuse,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    id: `brief-${profile.id}`,
    concept: `${profile.name} 的可追溯创作事务所`,
    narrative:
      "访客从中庭认识主人，沿四条明确动线进入项目、经历、技能与成就房。每件展品都能回到履历原文。",
    spatialStrategy:
      "采用可一眼读懂的十字形剖面大屋：中庭承担身份信息，四个相连房间各自承载单一内容类型；热点和侧栏共同提供可访问入口。",
    mood: ["architectural", "editorial", "warm-tech", "low-poly"],
    palette: {
      background: "#eeeeea",
      floor: "#d8d8d3",
      accent: "#111111",
      highlight: "#686868",
      rooms: {
        lobby: "#d1d1cc",
        projects: "#c4c4bf",
        experience: "#ddddda",
        skills: "#b9b9b4",
        achievements: "#e4e4e0",
      },
    },
    references,
  };
}
