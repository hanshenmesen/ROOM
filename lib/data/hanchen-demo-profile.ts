import profile from "./hanchen-demo-profile.json" with { type: "json" };
import type { ParsedProfile } from "../types.ts";

export const hanchenDemoProfile = profile as ParsedProfile;
