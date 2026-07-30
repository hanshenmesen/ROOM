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
      "访客先面对林澈的小别墅，亲自打开正门进入客厅；客厅只保留一道门，进入陈列四个精选项目的作品房。每个项目都能回到履历原文。",
    spatialStrategy:
      "采用客厅加作品房的两段式小别墅。外部阶段展示完整立面与正门；入户后只呈现当前房间；进入作品房和选择项目时，镜头逐级靠近。",
    mood: ["architectural-diorama", "warm-cyber", "dense-personal", "low-poly"],
    palette: {
      background: "#171720",
      floor: "#5a4033",
      accent: "#ff8b61",
      highlight: "#68d8c4",
      rooms: {
        lobby: "#cc8a5e",
        projects: "#6678bd",
        experience: "#b76555",
        skills: "#39766f",
        achievements: "#83568d",
      },
    },
    references,
  };
}
