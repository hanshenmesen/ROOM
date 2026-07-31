import { parseProfile } from "../agents/parser.ts";
import type { ParsedProfile, ProfileMedia } from "../types.ts";
import { sampleResume } from "./sample-resume.ts";

export const FICTIONAL_DEMO_PROFILE_ID = "profile-fictional-lin-che";

const portrait: ProfileMedia = {
  url: "./assets/demo/lin-che-portrait.png",
  originalUrl: "./assets/demo/lin-che-portrait.png",
  sourcePage: "ROOM 内置虚构 Demo",
  locator: "asset:lin-che-portrait.png",
  alt: "虚构人物林澈的卡通头像",
  title: "林澈（虚构人物）",
  kind: "profile",
  category: "profile-photo",
  categoryConfidence: 1,
  categoryReason: "用户为 ROOM 内置虚构 Demo 指定的卡通头像。",
};

const parsedProfile = parseProfile(sampleResume, {
  type: "text",
  label: "林澈｜ROOM 内置虚构人物 Demo",
});

export const fictionalDemoProfile: ParsedProfile = {
  ...parsedProfile,
  id: FICTIONAL_DEMO_PROFILE_ID,
  name: "林澈",
  location: "上海",
  personalWebsite: "https://linche.example",
  personalWebsiteEvidence: [{
    sourceId: parsedProfile.source.id,
    locator: "line:55",
    excerpt: "https://linche.example",
    origin: "source",
  }],
  media: [portrait],
};
