import { retrieveCreativeReferences } from "../rag/creative-retrieval.ts";
import type { CreativeBrief, ParsedProfile } from "../types.ts";

const roomKeywords = ["room", "房间", "空间", "project", "项目", "gallery", "interactive"];

export function directWorld(profile: ParsedProfile): CreativeBrief {
  const itemText = profile.items.slice(0, 30).flatMap((item) => [
    item.title,
    item.summary,
    item.tags.join(" "),
    (item.techStack || []).join(" "),
  ]).join(" ");
  const { references } = retrieveCreativeReferences({
    text: [
      profile.headline,
      profile.summary,
      profile.skills.join(" "),
      (profile.hobbies || []).join(" "),
      itemText,
      roomKeywords.join(" "),
    ].join(" "),
    purpose: "implementation",
    categories: ["room", "world", "template"],
    limit: 5,
  });

  return {
    id: `brief-${profile.id}`,
    concept: `${profile.name} 的可追溯创作事务所`,
    narrative:
      `访客先面对 ${profile.name} 的小别墅，亲自打开正门进入公开陈列客厅；个人信息、项目、技能与档案都在这里被看见。侧门后的私人卧室需要密码进入，并在当前版本保持留白。`,
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
