import type { ExtractionShard } from "./types.ts";

export type InventoryExpectations = {
  minimumItems: number;
  researchItems: number;
  careerItems: number;
  requireEducation: boolean;
  requireExperience: boolean;
  requireResearch: boolean;
};

const SOURCE_SECTION_HEADING = /^(?:教育经历|教育背景|科研成果|研究成果|工作实习|工作经历|实习经历|课外活动|荣誉奖励|喜欢的食物|食物|饮食偏好|兴趣爱好|个人爱好|技能|education|research(?: outputs?)?|publications?|work experience|experience|internships?|activities|awards?|favorite foods?|food preferences?|interests?|hobbies|skills)\s*$/im;

function sourceSection(text: string, heading: RegExp) {
  const match = heading.exec(text);
  if (!match || match.index === undefined) return "";
  const tail = text.slice(match.index + match[0].length);
  const nextHeading = SOURCE_SECTION_HEADING.exec(tail);
  return nextHeading?.index === undefined ? tail : tail.slice(0, nextHeading.index);
}
function countDatedEntries(text: string) {
  return [...text.matchAll(/(?:19|20)\d{2}[./-]\d{1,2}\s*(?:-|–|—|至)\s*(?:(?:19|20)\d{2}[./-]\d{1,2}|至今|present|now)/gi)].length;
}

function countNumberedEntries(text: string) {
  return [...text.matchAll(/(?:^|\n)\s*\d+[.)]\s+/g)].length;
}

export function inventoryExpectations(text: string): InventoryExpectations {
  const education = sourceSection(text, /^(?:教育经历|教育背景|education)\s*$/im);
  const research = sourceSection(text, /^(?:科研成果|研究成果|research(?: outputs?)?|publications?)\s*$/im);
  const experience = sourceSection(text, /^(?:工作实习|工作经历|实习经历|work experience|experience|internships?)\s*$/im);
  const activities = sourceSection(text, /^(?:课外活动|activities)\s*$/im);
  const educationCount = education ? Math.max(1, countDatedEntries(education)) : 0;
  const researchCount = research ? Math.max(1, countNumberedEntries(research)) : 0;
  const experienceCount = experience ? Math.max(1, countDatedEntries(experience)) : 0;
  const activityCount = activities ? Math.min(2, Math.max(1, countDatedEntries(activities))) : 0;
  const honorCount = /荣誉奖励|\bawards?\b/i.test(education) ? 1 : 0;
  const researchItems = researchCount;
  const careerItems = educationCount + experienceCount + activityCount + honorCount;
  return {
    minimumItems: Math.min(30, researchItems + careerItems),
    researchItems,
    careerItems,
    requireEducation: Boolean(education),
    requireExperience: Boolean(experience),
    requireResearch: Boolean(research),
  };
}

export function planInventoryShards(expectations: InventoryExpectations): ExtractionShard[] {
  return expectations.minimumItems >= 10
    && expectations.requireResearch
    && (expectations.requireEducation || expectations.requireExperience)
    ? ["research", "career"]
    : ["items"];
}
