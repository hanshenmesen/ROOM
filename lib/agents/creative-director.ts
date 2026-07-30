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
      "访客先面对林澈的小别墅，亲自打开正门进入公开陈列客厅；个人信息、项目、技能与档案都在这里被看见。侧门后的私人卧室需要密码进入，并在当前版本保持留白。",
    spatialStrategy:
      "采用公开陈列客厅加私密卧室的两段式小别墅。客厅集中展示履历内容和可点击项目；卧室通过本地密码门禁进入，当前只保留完整空间外壳。",
    mood: ["architectural-diorama", "warm-cyber", "dense-personal", "low-poly"],
    palette: {
      background: "#171720",
      floor: "#5a4033",
      accent: "#ff8b61",
      highlight: "#68d8c4",
      rooms: {
        lobby: "#cc8a5e",
        bedroom: "#6678bd",
        experience: "#b76555",
        skills: "#39766f",
        achievements: "#83568d",
      },
    },
    references,
  };
}
