"use client";

/* eslint-disable @next/next/no-img-element */

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { compileProfile } from "@/lib/agents/pipeline";
import { latestAgentRunMessage } from "@/lib/agent-runtime/events";
import type { AgentRunEvent, AgentRunSnapshot } from "@/lib/agent-runtime/run-types";
import { AgentMetricsPanel } from "@/components/AgentMetricsPanel";
import { AgentTracePanel } from "@/components/AgentTracePanel";
import type { PublicAgentConfigStatus } from "@/lib/agents/provider-config";
import {
  BROWSER_AGENT_SESSION_KEY,
  browserAgentConfigHeaders,
  browserPortraitArtConfigHeaders,
  normalizeBrowserAgentConfig,
  type BrowserAgentConfig,
} from "@/lib/browser-agent-config";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import {
  resolveProfileMergeReview,
  type ProfileMergeReport,
  type ProfileReviewResolution,
} from "@/lib/profile-merge";
import { FICTIONAL_DEMO_PROFILE_ID, fictionalDemoProfile } from "@/lib/data/fictional-demo-profile";
import {
  DIARY_STORAGE_KEY,
  MAX_DIARY_IMAGE_BYTES,
  MAX_DIARY_TEXT_LENGTH,
  appendDiaryEntry,
  diaryEntryFromDraft,
  type DiaryEntry,
} from "@/lib/diary";
import {
  applyProjectEdits,
  projectEditFromItem,
  updateProjectEdit,
  type ProjectEdit,
  type ProjectEdits,
} from "@/lib/project-edits";
import {
  PROFILE_HISTORY_STORAGE_KEY,
  isSavedProfileRecord,
  upsertSavedProfile,
  type SavedProfileRecord,
} from "@/lib/profile-history";
import {
  createHeatLedger,
  heatItems,
  heatStorageKey,
  incrementHeatLedger,
  parseHeatLedger,
  publicHeatTargets,
  type ExhibitHeatLedger,
  type ExhibitHeatItem,
} from "@/lib/exhibit-heat";
import { sceneReadinessProgress } from "@/lib/scene-entry";
import {
  DEFAULT_MUSIC_BOX_TRACK,
  MUSIC_BOX_TRACKS,
  musicBoxTrack,
} from "@/lib/background-music";
import { displayStandTitle, sanitizeDisplayText } from "@/lib/display-copy";
import {
  DEFAULT_PET_CUSTOMIZATION,
  LEGACY_PRIVATE_FRAME_STORAGE_KEY,
  PRIVATE_FRAME_SLOTS,
  defaultProfileSpaceCustomization,
  normalizePetCustomization,
  normalizePrivateFrameImages,
  normalizeProfileSpaceCustomization,
  profileSpaceStorageKey,
  type PetCustomization,
  type PrivateFrameImages,
  type PrivateFrameSlot,
  type ProfileSpaceCustomization,
} from "@/lib/profile-space-customization";
import { normalizeRoomCompanionName } from "@/lib/room-companion";
import type { ContentFamily, ParsedProfile, PipelineResult, ProfileItem } from "@/lib/types";
import {
  beginSceneLoading,
  type SceneLoadingSnapshot,
} from "./SceneLoadingStore";
import { AgentSetupDialog } from "./AgentSetupDialog";
import { ExhibitFocusScreen, type ExhibitFocusSection } from "./ExhibitFocusScreen";
import { ExhibitHeatPanel } from "./ExhibitHeatPanel";
import { BackgroundMusicController, type BackgroundMusicControllerHandle } from "./BackgroundMusicController";
import { MoveInStudio, type MoveInStep } from "./MoveInStudio";
import { PetQaPanel } from "./PetQaPanel";
import { ProductFlowLanding } from "./ProductFlowLanding";
import { ProfileReviewPanel } from "./ProfileReviewPanel";

const WorldCanvas = dynamic(
  () => import("./WorldCanvas").then((module) => module.WorldCanvas),
  { ssr: false },
);

const PRIVATE_ROOM_ID = "room-private";
const PROJECTS_PER_PAGE = 3;
const OWNER_PRIVATE_PASSWORD = "owner2026";
const VISITOR_PRIVATE_PASSWORD = "visit2026";
const GUESTBOOK_STORAGE_KEY = "room:guestbook:v1";
const SOURCE_BROWSER_ID = "showroom-source-browser";
const GRAMOPHONE_ID = "showroom-gramophone";
const HOBBIES_ID = "showroom-hobbies";
const SNACKS_ID = "showroom-snacks";
const PROJECT_EDITS_STORAGE_PREFIX = "room:project-edits:v1:";
const EMPTY_PROJECT_EDIT: ProjectEdit = { title: "", summary: "" };
function profileStats(profile: ParsedProfile) {
  return {
    projects: profile.items.filter((item) => item.kind === "project").length,
    journey: profile.items.filter((item) => ["experience", "education"].includes(item.kind)).length,
    skills: profile.skills.length,
    achievements: profile.items.filter((item) => item.kind === "achievement").length,
  };
}

const fictionalDemoStats = profileStats(fictionalDemoProfile);
const CONTENT_FAMILY_LABELS: Record<ContentFamily, string> = {
  publication: "论文 / 研究",
  talk: "演讲",
  exhibition: "展览",
  "open-source": "开源项目",
  "media-coverage": "媒体报道",
};

type GuestbookEntry = {
  id: string;
  name: string;
  message: string;
  createdAt: string;
};

type BedroomAccessMode = "owner" | "visitor";

const FICTIONAL_DEMO_FRAME_IMAGES: PrivateFrameImages = {
  "private-frame-1": "./assets/demo/frame-xhs-lobby.jpg",
  "private-frame-2": "./assets/demo/frame-buildathon-workspace.jpg",
  "private-frame-3": "./assets/demo/frame-buildathon-camp.jpg",
};

type PortraitArtStatus = "idle" | "generating" | "ready" | "error";
type ExhibitFocusPhase = "idle" | "travelling" | "presented";

const BEDROOM_ACCESS_COPY: Record<BedroomAccessMode, { label: string; password: string; canEditDiary: boolean; description: string }> = {
  owner: {
    label: "本人",
    password: OWNER_PRIVATE_PASSWORD,
    canEditDiary: true,
    description: "可浏览、上传图片并新增本机日记。",
  },
  visitor: {
    label: "参观",
    password: VISITOR_PRIVATE_PASSWORD,
    canEditDiary: false,
    description: "只能浏览已保存日记，不能编辑或上传。",
  },
};

function canEditPrivateDiary(mode: BedroomAccessMode | "") {
  return mode === "owner";
}

function isValidBedroomPassword(mode: BedroomAccessMode | "", password: string) {
  return Boolean(mode) && BEDROOM_ACCESS_COPY[mode as BedroomAccessMode].password === password;
}

function profileWithPortraitUrl(profile: ParsedProfile, portraitUrl: string) {
  return {
    ...profile,
    media: profile.media.map((media) => (
      media.category === "profile-photo"
        ? { ...media, url: portraitUrl }
        : media
    )),
  };
}

function portraitSourceRequestUrl(url: string) {
  return /^https?:\/\//i.test(url)
    ? `/api/media?url=${encodeURIComponent(url)}`
    : url;
}

function abstractPortraitPlaceholder() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<rect width="512" height="512" fill="#f7f4ed"/>',
    '<g fill="none" stroke="#111" stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M104 397c18-77 56-137 109-165 31-17 40-53 69-74 35-25 89-3 106 35" stroke-width="12"/>',
    '<path d="M151 116c37 15 82-23 128-7 39 14 73 53 75 101" stroke-width="7"/>',
    '<path d="M185 190c-22 50-18 118 10 159" stroke-width="5"/>',
    '<path d="M319 180c18 44 12 103-10 139" stroke-width="9"/>',
    '<path d="M144 420c77-29 153-24 228 11" stroke-width="15"/>',
    '<path d="M77 269c42 1 60 21 84 51" stroke-width="4"/>',
    '<path d="M369 284c28-33 46-43 72-39" stroke-width="6"/>',
    '<path d="M183 246c18-24 57-10 44 18-10 22-45 16-37-6 6-16 29-14 28 1" stroke-width="6"/>',
    '<path d="M300 244c19-14 39-7 52 7" stroke-width="10"/>',
    '<path d="m269 235-18 58 31 18-24 34" stroke-width="7"/>',
    '<path d="M210 365c23 12 53-9 76 4m-47 15c20 9 38 4 55-7" stroke-width="5"/>',
    '<path d="M128 185c-33 3-42 36-20 52m282 79c36 9 42 43 13 58" stroke-width="4"/>',
    '</g>',
    '</svg>',
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type SelectedDetail = {
  eyebrow: string;
  title: string;
  body: string;
  sections?: ExhibitFocusSection[];
  sourceItemId?: string;
  imageUrl?: string;
  editableProject?: boolean;
  metadata?: {
    label: string;
    value: string;
  }[];
  sourceUrl?: string;
};

type SourceLink = {
  label: string;
  url: string;
};

function collectSourceLinks(profile: ParsedProfile | null, item?: ProfileItem): SourceLink[] {
  if (!profile) return [];
  const links = new Map<string, string>();
  const safeAdd = (url: string | undefined, label: string) => {
    const safeUrl = safeExternalHref(url);
    if (!safeUrl) return;
    links.set(safeUrl, label);
  };
  if (item) {
    safeAdd(item.projectUrl, "项目源文件");
    safeAdd(item.sourceUrl, "项目原始来源");
  }
  if (profile.source.type === "url") {
    safeAdd(profile.source.id, "个人主页");
  }
  return Array.from(links.entries()).map(([url, label]) => ({ label, url }));
}

function appendLocation(headline: string, location?: string) {
  if (!location || headline.toLocaleLowerCase().includes(location.toLocaleLowerCase())) return headline;
  return `${headline} · ${location}`;
}

function formatContactLines(contacts: string[]) {
  return contacts.length
    ? contacts.map(sanitizeDisplayText).join("\n")
    : "暂无可展示的联系方式。";
}

function formatJourneyDetail(item: ProfileItem) {
  const heading = `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
  const sameAsHeading = item.summary.replace(/\s+/g, " ").trim() === heading.replace(/\s+/g, " ").trim();
  return [
    heading,
    sameAsHeading ? "" : item.summary,
  ].filter((value): value is string => Boolean(value)).map(sanitizeDisplayText).join("\n");
}

function readStoredEntries<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeStoredEntries<T>(key: string, entries: T[]) {
  window.localStorage.setItem(key, JSON.stringify(entries));
}

function readStoredProjectEdits(profileId: string): ProjectEdits {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(`${PROJECT_EDITS_STORAGE_PREFIX}${profileId}`);
    return stored ? JSON.parse(stored) as ProjectEdits : {};
  } catch {
    return {};
  }
}

function writeStoredProjectEdits(profileId: string, edits: ProjectEdits) {
  window.localStorage.setItem(`${PROJECT_EDITS_STORAGE_PREFIX}${profileId}`, JSON.stringify(edits));
}

function readStoredHeatLedger(profileId: string): ExhibitHeatLedger | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(heatStorageKey(profileId));
    return stored ? parseHeatLedger(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeStoredProfileSpace(space: ProfileSpaceCustomization) {
  window.localStorage.setItem(profileSpaceStorageKey(space.profileId), JSON.stringify(space));
}

function readStoredProfileSpace(profileId: string) {
  if (typeof window === "undefined") return defaultProfileSpaceCustomization(profileId);
  try {
    const stored = window.localStorage.getItem(profileSpaceStorageKey(profileId));
    if (stored) return normalizeProfileSpaceCustomization(JSON.parse(stored), profileId);

    if (profileId !== FICTIONAL_DEMO_PROFILE_ID) {
      const legacy = window.localStorage.getItem(LEGACY_PRIVATE_FRAME_STORAGE_KEY);
      const legacyFrames = legacy ? normalizePrivateFrameImages(JSON.parse(legacy)) : {};
      if (Object.keys(legacyFrames).length) {
        const migrated = { ...defaultProfileSpaceCustomization(profileId), frameImages: legacyFrames };
        writeStoredProfileSpace(migrated);
        window.localStorage.removeItem(LEGACY_PRIVATE_FRAME_STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    // Invalid or unavailable local storage falls back to an empty profile space.
  }
  return defaultProfileSpaceCustomization(profileId);
}

function readBrowserAgentConfig() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(BROWSER_AGENT_SESSION_KEY);
    if (!stored) return null;
    return normalizeBrowserAgentConfig(JSON.parse(stored));
  } catch {
    return null;
  }
}

function resizeProjectCover(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {},
) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件。"));
      return;
    }
    if (file.size > 8_000_000) {
      reject(new Error("原图请控制在 8 MB 以内。"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("这张图片无法读取，请换一张再试。"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("这张图片无法读取，请换一张再试。"));
        return;
      }
      const image = new window.Image();
      image.onerror = () => reject(new Error("这张图片无法解码，请换一张再试。"));
      image.onload = () => {
        const maxWidth = options.maxWidth || 1440;
        const maxHeight = options.maxHeight || 960;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("浏览器无法处理这张图片。"));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", options.quality ?? 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function createEntryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeExternalHref(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatHighlightDetail(item: ProfileItem) {
  const label = item.contentFamily
    ? CONTENT_FAMILY_LABELS[item.contentFamily]
    : "成就";
  return [
    `[${label}] ${item.title}`,
    item.subtitle,
    item.summary,
    item.tags.length ? `关键词：${item.tags.join(" · ")}` : "",
  ].filter((value): value is string => Boolean(value)).map(sanitizeDisplayText).join("\n");
}

function formatProjectIndexDetail(item: ProfileItem) {
  const heading = `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
  const sameAsHeading = item.summary.replace(/\s+/g, " ").trim() === heading.replace(/\s+/g, " ").trim();
  return [
    heading,
    sameAsHeading ? "" : item.summary,
    item.timeRange ? `时间：${item.timeRange}` : "",
    item.role ? `角色：${item.role}` : "",
    item.techStack?.length ? `技术栈：${item.techStack.join(" · ")}` : "",
  ].filter(Boolean).map(sanitizeDisplayText).join("\n");
}

function detailSectionForItem(item: ProfileItem, semanticRole?: string): ExhibitFocusSection {
  const heading = sanitizeDisplayText(item.title);
  const summary = sanitizeDisplayText(item.summary);
  const sameAsHeading = summary.replace(/\s+/g, " ").trim() === heading.replace(/\s+/g, " ").trim();
  const meta = [
    semanticRole === "achievement" && item.contentFamily
      ? CONTENT_FAMILY_LABELS[item.contentFamily]
      : "",
    item.subtitle,
    item.timeRange,
    item.role,
  ]
    .filter((value): value is string => Boolean(value))
    .map(sanitizeDisplayText)
    .filter((value, index, values) => values.indexOf(value) === index);
  return {
    title: heading,
    meta,
    body: sameAsHeading ? undefined : summary,
    tags: item.techStack?.map(sanitizeDisplayText).filter(Boolean),
  };
}

function projectMetadataForDetail(exhibit: PipelineResult["world"]["exhibits"][number]) {
  const metadata: NonNullable<SelectedDetail["metadata"]> = [];
  if (exhibit.timeRange) {
    metadata.push({
      label: "时间",
      value: exhibit.timeRange,
    });
  }
  if (exhibit.role) {
    metadata.push({
      label: "角色",
      value: exhibit.role,
    });
  }
  if (exhibit.techStack?.length) {
    metadata.push({
      label: "技术栈",
      value: exhibit.techStack.join(" · "),
    });
  }
  if (exhibit.projectUrl) {
    metadata.push({
      label: "项目链接",
      value: exhibit.projectUrl,
    });
  }
  return metadata;
}

async function fetchAgentConfigStatus() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("configuration status unavailable");
  return response.json() as Promise<PublicAgentConfigStatus>;
}

export function RoomStudio() {
  const [introComplete, setIntroComplete] = useState(false);
  const [intakeTransition, setIntakeTransition] = useState<"entering" | "leaving" | "idle">("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [agentConfig, setAgentConfig] = useState<PublicAgentConfigStatus | null>(null);
  const [browserAgentConfig, setBrowserAgentConfig] = useState<BrowserAgentConfig | null>(null);
  const [agentConfigChecked, setAgentConfigChecked] = useState(false);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentRunEvents, setAgentRunEvents] = useState<AgentRunEvent[]>([]);
  const [agentRunProfileId, setAgentRunProfileId] = useState("");
  const [pendingProfile, setPendingProfile] = useState<ParsedProfile | null>(null);
  const [profileMergeReport, setProfileMergeReport] = useState<ProfileMergeReport | null>(null);
  const [moveInStep, setMoveInStep] = useState<MoveInStep>("pet");
  const [petCustomization, setPetCustomization] = useState<PetCustomization>({ ...DEFAULT_PET_CUSTOMIZATION });
  const companionName = normalizeRoomCompanionName(petCustomization.name);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfileRecord[]>([]);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [sceneCommitted, setSceneCommitted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLoadState, setSceneLoadState] = useState<SceneLoadingSnapshot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeRoom, setActiveRoom] = useState("room-lobby");
  const [cameraTransitioning, setCameraTransitioning] = useState(false);
  const [stairNavigationNearby, setStairNavigationNearby] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [focusPhase, setFocusPhase] = useState<ExhibitFocusPhase>("idle");
  const [privateGateOpen, setPrivateGateOpen] = useState(false);
  const [privateAccessMode, setPrivateAccessMode] = useState<BedroomAccessMode | "">("");
  const [privatePassword, setPrivatePassword] = useState("");
  const [privatePasswordError, setPrivatePasswordError] = useState("");
  const [privateUnlocked, setPrivateUnlocked] = useState(false);
  const [privateUnlockedMode, setPrivateUnlockedMode] = useState<BedroomAccessMode | "">("");
  const [guestbookEntries, setGuestbookEntries] = useState<GuestbookEntry[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestMessage, setGuestMessage] = useState("");
  const [guestbookError, setGuestbookError] = useState("");
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [diaryText, setDiaryText] = useState("");
  const [diaryImage, setDiaryImage] = useState("");
  const [diaryError, setDiaryError] = useState("");
  const [projectEdits, setProjectEdits] = useState<ProjectEdits>({});
  const [projectEditDraft, setProjectEditDraft] = useState<ProjectEdit>(EMPTY_PROJECT_EDIT);
  const [projectEditMessage, setProjectEditMessage] = useState("");
  const [sourceBrowserProjectId, setSourceBrowserProjectId] = useState("");
  const [privateFrameImages, setPrivateFrameImages] = useState<PrivateFrameImages>({});
  const [privateFrameMessage, setPrivateFrameMessage] = useState("");
  const [gramophoneTrackId, setGramophoneTrackId] = useState<string>(DEFAULT_MUSIC_BOX_TRACK.id);
  const [gramophoneMusicUrl, setGramophoneMusicUrl] = useState<string>(DEFAULT_MUSIC_BOX_TRACK.src);
  const [gramophoneMusicName, setGramophoneMusicName] = useState<string>(DEFAULT_MUSIC_BOX_TRACK.title);
  const [gramophoneVolume, setGramophoneVolume] = useState(0.7);
  const [gramophonePlaying, setGramophonePlaying] = useState(false);
  const [petSpeechActive, setPetSpeechActive] = useState(false);
  const [gramophoneMessage, setGramophoneMessage] = useState("");
  const [originalPortraitUrl, setOriginalPortraitUrl] = useState("");
  const [abstractPortraitUrl, setAbstractPortraitUrl] = useState("");
  const [portraitArtStatus, setPortraitArtStatus] = useState<PortraitArtStatus>("idle");
  const [portraitArtMessage, setPortraitArtMessage] = useState("");
  const [portraitGenerationSettled, setPortraitGenerationSettled] = useState(true);
  const [heatPanelOpen, setHeatPanelOpen] = useState(false);
  const [exhibitHeat, setExhibitHeat] = useState<ExhibitHeatLedger | null>(null);
  const [petQaOpen, setPetQaOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const diaryImageInput = useRef<HTMLInputElement>(null);
  const projectImageInput = useRef<HTMLInputElement>(null);
  const musicController = useRef<BackgroundMusicControllerHandle>(null);
  const gramophoneAudio = useRef<HTMLAudioElement>(null);
  const gramophoneFileInput = useRef<HTMLInputElement>(null);
  const pageTransitionTimer = useRef<number | null>(null);
  const portraitGeneration = useRef(0);
  const selectedPrivateFrameSlot = PRIVATE_FRAME_SLOTS.includes(selectedId as PrivateFrameSlot)
    ? selectedId as PrivateFrameSlot
    : undefined;
  const diaryWritable = canEditPrivateDiary(privateUnlockedMode);
  const agentReady = Boolean(
    browserAgentConfig?.maas.apiKey || browserAgentConfig?.website.apiKey || agentConfig?.ready,
  );
  const agentRunMessage = useMemo(() => latestAgentRunMessage(agentRunEvents), [agentRunEvents]);
  const hasSourceInput = Boolean(url.trim() || sourceFile);
  const sceneResourcesReady = Boolean(
    sceneLoadState
      && (
        (sceneLoadState.progress >= 100 && ["ready", "degraded", "failed"].includes(sceneLoadState.status))
        || (sceneLoadState.status === "idle" && sceneLoadState.total === 0)
      ),
  );
  const sceneCanReveal = sceneCommitted && sceneResourcesReady && portraitGenerationSettled;
  const displayedSceneProgress = sceneReadinessProgress({
    resourceProgress: sceneProgress,
    portraitSettled: portraitGenerationSettled,
    sceneCommitted,
    ready: sceneReady,
  });
  const heatTargets = useMemo(
    () => result
      ? publicHeatTargets(result.world, PROJECTS_PER_PAGE)
        .filter((target) => target.projectPage === undefined || target.projectPage === 0)
      : [],
    [result],
  );
  const visibleHeatItems = useMemo(
    () => exhibitHeat ? heatItems(heatTargets, exhibitHeat) : [],
    [exhibitHeat, heatTargets],
  );
  const focusableExhibitIds = useMemo(
    () => {
      const availableIds = new Set([
        ...heatTargets.map((target) => target.id),
        HOBBIES_ID,
        SNACKS_ID,
      ]);
      const projectIds = heatTargets
        .filter((target) => target.kind === "project-pedestal")
        .map((target) => target.id);
      return [
        "showroom-highlights",
        "showroom-profile",
        SNACKS_ID,
        ...projectIds,
        "showroom-skills",
        HOBBIES_ID,
        "showroom-education",
        "showroom-works",
        "showroom-contact",
        "showroom-experience",
      ].filter((id) => availableIds.has(id));
    },
    [heatTargets],
  );
  const selectedFocusIndex = focusableExhibitIds.indexOf(selectedId);
  const selectedDetail = useMemo<SelectedDetail | undefined>(() => {
    if (!result || !selectedId || selectedId === "showroom-guestbook" || selectedId === "bedroom-diary" || selectedId === GRAMOPHONE_ID) return undefined;
    if (selectedId === HOBBIES_ID) {
      return {
        eyebrow: "HOBBIES",
        title: "爱好",
        body: "球类运动\n\n篮球 · 足球 · 网球\n\n在运动里保持活力，也享受与朋友一起比赛和交流的时刻。",
      };
    }
    if (selectedId === SNACKS_ID) {
      return {
        eyebrow: "FOOD",
        title: "食物",
        body: "新鲜水果 · 果汁与饮料\n\n这里展示水果、饮品等食物，是逛展间隙补充能量的小角落。",
      };
    }
    const exhibit = result.world.exhibits.find((item) => item.id === selectedId);
    if (exhibit) {
      return {
        eyebrow: exhibit.eyebrow,
        title: sanitizeDisplayText(exhibit.title),
        body: exhibit.body.split("\n").map(sanitizeDisplayText).filter(Boolean).join("\n"),
        sourceItemId: exhibit.sourceItemId,
        imageUrl: exhibit.imageUrl,
        editableProject: exhibit.eyebrow === "PROJECT",
        metadata: projectMetadataForDetail(exhibit),
        sourceUrl: safeExternalHref(exhibit.projectUrl) || safeExternalHref(exhibit.sourceUrl),
      };
    }
    const resolvedSurfaceId = selectedId === "bedroom-portrait" ? "showroom-profile" : selectedId;
    const surface = result.world.displaySurfaces.find((item) => item.id === resolvedSurfaceId);
    if (!surface) return undefined;
    const sourceUrl = result.profile.source.type === "url" ? safeExternalHref(result.profile.source.id) : undefined;
    const surfaceItems = surface.sourceItemIds
      .map((sourceId) => result.profile.items.find((item) => item.id === sourceId))
      .filter((item): item is ProfileItem => Boolean(item));
    const eyebrowByRole = {
      profile: "PROFILE",
      education: "EDUCATION",
      experience: "EXPERIENCE",
      skills: "TOOLBOX",
      achievement: "HIGHLIGHTS",
      contact: "CONTACT",
      works: "WORKS",
    } as const;
    if (surface.semanticRole === "profile") {
      return {
        eyebrow: "PROFILE 01",
        title: result.profile.name,
        body: `${appendLocation(result.profile.headline, result.profile.location)}\n\n${result.profile.summary}`,
        sourceUrl,
      };
    }
    if (surface.semanticRole === "skills") {
      const skills = surface.sourceItemIds
        .filter((sourceId) => sourceId.startsWith("skill:"))
        .map((sourceId) => sourceId.slice("skill:".length));
      return {
        eyebrow: eyebrowByRole.skills,
        title: displayStandTitle(surface.title || "技能工具"),
        body: skills.map(sanitizeDisplayText).join("\n"),
        sourceUrl,
      };
    }
    if (surface.semanticRole === "contact") {
      const contacts = surface.sourceItemIds
        .filter((sourceId) => sourceId.startsWith("contact:"))
        .map((sourceId) => result.profile.contacts[Number(sourceId.slice("contact:".length)) - 1])
        .filter((contact): contact is string => Boolean(contact));
      return {
        eyebrow: eyebrowByRole.contact,
        title: displayStandTitle(surface.title || "联系方式"),
        body: formatContactLines(contacts),
        sourceUrl,
      };
    }
    const formatItem = surface.semanticRole === "achievement"
      ? formatHighlightDetail
      : surface.semanticRole === "works"
        ? formatProjectIndexDetail
        : formatJourneyDetail;
    return {
      eyebrow: surface.semanticRole ? eyebrowByRole[surface.semanticRole] : "SHOWROOM",
      title: displayStandTitle(surface.title || surface.kicker || "展示内容"),
      body: surfaceItems.length
        ? surfaceItems.map(formatItem).join("\n\n")
        : "原始资料中暂未识别到可展示内容。",
      sections: surfaceItems.length
        ? surfaceItems.map((item) => detailSectionForItem(item, surface.semanticRole))
        : undefined,
      sourceUrl,
    };
  }, [result, selectedId]);

  const selectedProjectItem = useMemo(() => {
    if (!result || !selectedDetail?.editableProject || !selectedDetail.sourceItemId) return undefined;
    return result.profile.items.find((item) => item.id === selectedDetail.sourceItemId && item.kind === "project");
  }, [result, selectedDetail]);
  const selectedMaterialIsPublication = selectedProjectItem?.contentFamily === "publication";

  const sourceBrowserProjectItem = useMemo(() => {
    if (!result || !sourceBrowserProjectId) return undefined;
    return result.profile.items.find((item) => item.id === sourceBrowserProjectId && item.kind === "project");
  }, [result, sourceBrowserProjectId]);

  const sourceBrowserLinks = useMemo(
    () => collectSourceLinks(result ? result.profile : null, sourceBrowserProjectItem || selectedProjectItem),
    [result, selectedProjectItem, sourceBrowserProjectItem],
  );
  const portraitDetailSelected = selectedId === "showroom-profile" || selectedId === "bedroom-portrait";
  const visiblePortraitUrl = abstractPortraitUrl
    || result?.profile.media.find((media) => media.category === "profile-photo")?.url
    || "";
  const displayedPrivateFrameImages = result?.profile.id === FICTIONAL_DEMO_PROFILE_ID
    ? { ...FICTIONAL_DEMO_FRAME_IMAGES, ...privateFrameImages }
    : privateFrameImages;

  useEffect(() => {
    let cancelled = false;
    const storedBrowserConfig = readBrowserAgentConfig();
    const configTimer = window.setTimeout(() => setBrowserAgentConfig(storedBrowserConfig), 0);
    void fetchAgentConfigStatus()
      .then((status) => {
        if (cancelled) return;
        setAgentConfig(status);
        setAgentConfigChecked(true);
        if (!status.ready && !storedBrowserConfig) setAgentSetupOpen(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAgentConfig(null);
        setAgentConfigChecked(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(configTimer);
    };
  }, []);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setGuestbookEntries(readStoredEntries<GuestbookEntry>(GUESTBOOK_STORAGE_KEY));
      setDiaryEntries(readStoredEntries<DiaryEntry>(DIARY_STORAGE_KEY));
      setSavedProfiles(
        readStoredEntries<unknown>(PROFILE_HISTORY_STORAGE_KEY).filter(isSavedProfileRecord),
      );
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => () => {
    if (pageTransitionTimer.current !== null) window.clearTimeout(pageTransitionTimer.current);
    portraitGeneration.current += 1;
  }, []);

  useEffect(() => () => {
    if (abstractPortraitUrl.startsWith("blob:")) URL.revokeObjectURL(abstractPortraitUrl);
  }, [abstractPortraitUrl]);

  useEffect(() => {
    if (gramophoneAudio.current) {
      gramophoneAudio.current.volume = petSpeechActive
        ? Math.min(gramophoneVolume, 0.12)
        : gramophoneVolume;
    }
  }, [gramophoneVolume, petSpeechActive]);

  useEffect(() => () => {
    if (gramophoneMusicUrl.startsWith("blob:")) URL.revokeObjectURL(gramophoneMusicUrl);
  }, [gramophoneMusicUrl]);

  useEffect(() => {
    function closeTransientUi(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelectedId("");
      setFocusPhase("idle");
      setPrivateGateOpen(false);
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setAgentSetupOpen(false);
      setPetQaOpen(false);
    }

    window.addEventListener("keydown", closeTransientUi);
    return () => window.removeEventListener("keydown", closeTransientUi);
  }, []);

  const handleSceneProgress = useCallback((progress: number) => {
    const rounded = Math.max(0, Math.round(progress));
    const bounded = Math.min(100, rounded);
    setSceneProgress((current) => Math.max(current, bounded));
  }, []);

  const handleSceneReady = useCallback(() => {
    setSceneCommitted(true);
  }, []);

  const handleSceneLoadState = useCallback((snapshot: SceneLoadingSnapshot) => {
    setSceneLoadState(snapshot);
  }, []);

  useEffect(() => {
    if (!result || sceneReady || !sceneCanReveal) return;
    const revealFrame = window.requestAnimationFrame(() => setSceneReady(true));
    return () => window.cancelAnimationFrame(revealFrame);
  }, [result, sceneCanReveal, sceneReady]);

  function resetPrivateAccess() {
    setPrivateGateOpen(false);
    setPrivateAccessMode("");
    setPrivatePassword("");
    setPrivatePasswordError("");
    setPrivateUnlocked(false);
    setPrivateUnlockedMode("");
  }

  function prewarmMuseum() {
    void Promise.all([import("./MardouMuseumPreload"), import("./WorldCanvasPreload")])
      .then(([{ preloadMardouMuseum }, { preloadWorldCanvasAssets }]) => {
        preloadMardouMuseum();
        preloadWorldCanvasAssets();
      })
      .catch(() => {
        // The normal Canvas loader remains the fallback if speculative preloading is unavailable.
      });
  }

  function showIntake() {
    prewarmMuseum();
    setIntroComplete(true);
    setIntakeTransition("entering");
    if (pageTransitionTimer.current !== null) window.clearTimeout(pageTransitionTimer.current);
    pageTransitionTimer.current = window.setTimeout(() => {
      setIntakeTransition("idle");
      pageTransitionTimer.current = null;
    }, 680);
  }

  function returnToStory() {
    setIntakeTransition("leaving");
    if (pageTransitionTimer.current !== null) window.clearTimeout(pageTransitionTimer.current);
    pageTransitionTimer.current = window.setTimeout(() => {
      setIntroComplete(false);
      setIntakeTransition("idle");
      pageTransitionTimer.current = null;
    }, 440);
  }

  function openWorld(profile: ParsedProfile, preparedSpace?: ProfileSpaceCustomization) {
    const profileSpace = preparedSpace || readStoredProfileSpace(profile.id);
    const storedProjectEdits = readStoredProjectEdits(profile.id);
    const editedProfile = applyProjectEdits(profile, storedProjectEdits);
    const sourcePortrait = editedProfile.media.find((media) => media.category === "profile-photo")?.url || "";
    const shouldGeneratePortraitArt = Boolean(sourcePortrait) && profile.id !== FICTIONAL_DEMO_PROFILE_ID;
    const displayProfile = shouldGeneratePortraitArt
      ? profileWithPortraitUrl(editedProfile, abstractPortraitPlaceholder())
      : editedProfile;
    const next = compileProfile(displayProfile, {
      priorEvents: agentRunProfileId === profile.id ? agentRunEvents : undefined,
    });
    beginSceneLoading();
    void musicController.current?.start();
    setSceneProgress(0);
    setSceneCommitted(false);
    setSceneReady(false);
    setSceneLoadState(null);
    setResult(next);
    setProjectEdits(storedProjectEdits);
    const heatTargetsForWorld = publicHeatTargets(next.world, PROJECTS_PER_PAGE)
      .filter((target) => target.projectPage === undefined || target.projectPage === 0);
    setExhibitHeat(createHeatLedger(profile.id, heatTargetsForWorld, readStoredHeatLedger(profile.id)));
    setProjectEditDraft(EMPTY_PROJECT_EDIT);
    setProjectEditMessage("");
    setSelectedId("");
    setFocusPhase("idle");
    setActiveRoom("room-lobby");
    setSourceBrowserProjectId("");
    setPendingProfile(null);
    setProfileMergeReport(null);
    setPetCustomization(profileSpace.pet);
    setPrivateFrameImages(profileSpace.frameImages);
    setPrivateFrameMessage("");
    setOriginalPortraitUrl(shouldGeneratePortraitArt ? sourcePortrait : "");
    setAbstractPortraitUrl("");
    setPortraitArtStatus(shouldGeneratePortraitArt ? "generating" : "idle");
    setPortraitArtMessage(shouldGeneratePortraitArt ? "正在创作抽象肖像，真人照片不会出现在展厅中…" : "");
    setPortraitGenerationSettled(!shouldGeneratePortraitArt);
    setPetQaOpen(false);
    resetPrivateAccess();
    setMessage("");
    if (shouldGeneratePortraitArt) void generateAbstractPortrait(sourcePortrait, next.profile);
  }

  async function generateAbstractPortrait(sourceUrl = originalPortraitUrl, baseProfile?: ParsedProfile) {
    const targetProfile = baseProfile || result?.profile;
    if (!targetProfile || !sourceUrl || portraitArtStatus === "generating" && !baseProfile) return;
    const generation = portraitGeneration.current + 1;
    portraitGeneration.current = generation;
    setPortraitArtStatus("generating");
    setPortraitGenerationSettled(false);
    setPortraitArtMessage("正在创作抽象肖像，真人照片不会出现在展厅中…");
    try {
      const sourceResponse = await fetch(portraitSourceRequestUrl(sourceUrl), { cache: "no-store" });
      if (!sourceResponse.ok) throw new Error("无法读取当前解析头像，请检查图片来源后重试。");
      const sourceBlob = await sourceResponse.blob();
      if (!sourceBlob.type.startsWith("image/")) throw new Error("当前头像不是可处理的图片格式。");

      const form = new FormData();
      const extension = sourceBlob.type === "image/jpeg" ? "jpg" : sourceBlob.type.split("/")[1] || "png";
      form.set("image", new File([sourceBlob], `profile-photo.${extension}`, { type: sourceBlob.type }));
      const response = await fetch("/api/profile-art", {
        method: "POST",
        headers: browserPortraitArtConfigHeaders(browserAgentConfig),
        body: form,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "抽象肖像生成失败，请稍后重试。");
      }
      const artBlob = await response.blob();
      if (!artBlob.type.startsWith("image/") || !artBlob.size) throw new Error("图像服务没有返回可用图片。");
      const nextArtUrl = URL.createObjectURL(artBlob);
      if (generation !== portraitGeneration.current) {
        URL.revokeObjectURL(nextArtUrl);
        return;
      }
      setAbstractPortraitUrl(nextArtUrl);
      setPortraitArtStatus("ready");
      setPortraitGenerationSettled(true);
      setPortraitArtMessage("AI 抽象肖像已生成并同步到展厅。");
      setResult((current) => compileProfile(
        profileWithPortraitUrl(current?.profile || targetProfile, nextArtUrl),
        { priorEvents: agentRunProfileId === targetProfile.id ? agentRunEvents : undefined },
      ));
    } catch (error) {
      if (generation !== portraitGeneration.current) return;
      setPortraitArtStatus("error");
      setPortraitGenerationSettled(true);
      setPortraitArtMessage(error instanceof Error ? error.message : "抽象肖像生成失败，请稍后重试。");
    }
  }

  function returnToIntake() {
    portraitGeneration.current += 1;
    setResult(null);
    setAbstractPortraitUrl("");
    setOriginalPortraitUrl("");
    setPortraitArtStatus("idle");
    setPortraitArtMessage("");
    setPortraitGenerationSettled(true);
  }

  function rememberGeneratedProfile(profile: ParsedProfile) {
    const nextProfiles = upsertSavedProfile(savedProfiles, profile, new Date().toISOString());
    try {
      writeStoredEntries(PROFILE_HISTORY_STORAGE_KEY, nextProfiles);
      setSavedProfiles(nextProfiles);
      return true;
    } catch {
      return false;
    }
  }

  function acceptParsedProfile(profile: ParsedProfile, mergeReport?: ProfileMergeReport) {
    setPendingProfile(profile);
    if (mergeReport?.reviewRequired) {
      setProfileMergeReport(mergeReport);
      setMessage(`Agent 发现 ${mergeReport.conflicts.filter((conflict) => conflict.required).length} 个来源冲突，请结合证据确认后继续。`);
      return;
    }
    setProfileMergeReport(null);
    const remembered = rememberGeneratedProfile(profile);
    setMessage(remembered
      ? "Agent 已完成解析。设置好宠物和空间照片后，就可以进入。"
      : "你的小家已经准备好；浏览器空间不足，暂时没有加入最近生成。");
  }

  function confirmProfileReview(resolutions: ProfileReviewResolution[]) {
    if (!profileMergeReport) return;
    try {
      const reviewed = resolveProfileMergeReview(profileMergeReport, resolutions);
      setPendingProfile(reviewed.profile);
      setProfileMergeReport(null);
      const remembered = rememberGeneratedProfile(reviewed.profile);
      setMessage(remembered
        ? "冲突字段已按你的决定锁定，Agent 从检查点继续生成。"
        : "冲突字段已确认；浏览器空间不足，本次结果仅在当前会话保留。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法应用这次确认，请重试。");
    }
  }

  async function parseTextWithAgent(
    text: string,
    label: string,
    type: "text" | "url" = "text",
    media: ExtractedMedia[] = [],
    sourceUrl?: string,
    followWebsite = true,
  ) {
    const { response, data } = await requestTrackedAgentRun<{
      profile?: ParsedProfile;
      mergeReport?: ProfileMergeReport;
      error?: string;
      details?: string[];
      run?: AgentRunSnapshot;
    }>("/api/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...browserAgentConfigHeaders(browserAgentConfig),
      },
      body: JSON.stringify({
        text,
        label,
        sourceType: type,
        sourceId: type === "url" ? sourceUrl || label : undefined,
        media,
        followWebsite,
      }),
    });
    if (!response.ok || !data.profile) {
      throw new Error([data.error, ...(data.details || [])].filter(Boolean).join(" · ") || "Agent 解析失败。");
    }
    setAgentRunProfileId(data.profile.id);
    return { profile: data.profile, mergeReport: data.mergeReport };
  }

  async function requestTrackedAgentRun<T extends { run?: AgentRunSnapshot }>(
    input: string,
    init: RequestInit,
  ) {
    const runId = crypto.randomUUID();
    const headers = new Headers(init.headers);
    headers.set("x-room-agent-run-id", runId);
    setAgentRunEvents([]);
    const poll = async () => {
      try {
        const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}/events`, { cache: "no-store" });
        if (!response.ok) return;
        const run = await response.json() as AgentRunSnapshot;
        setAgentRunEvents(run.events);
      } catch {
        // The final POST response remains the fallback when in-memory polling is unavailable.
      }
    };
    const pollTimer = window.setInterval(() => void poll(), 500);
    // A 429 means this client's earlier Agent task is still running (slow
    // thinking-mode providers can hold a slot for a minute or two). Back off
    // and retry instead of failing the click outright.
    const maxConcurrencyRetries = 3;
    try {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(input, { ...init, headers });
        if (response.status !== 429 || attempt >= maxConcurrencyRetries) {
          const data = await response.json() as T;
          if (data.run) setAgentRunEvents(data.run.events);
          else await poll();
          return { response, data };
        }
        const retryAfterSeconds = Number(response.headers.get("retry-after")) || 2 * (attempt + 1);
        setMessage(`上一个 Agent 任务仍在运行，${retryAfterSeconds} 秒后自动重试（${attempt + 1}/${maxConcurrencyRetries}）…`);
        await new Promise((resolvePromise) => {
          window.setTimeout(resolvePromise, retryAfterSeconds * 1_000);
        });
      }
    } finally {
      window.clearInterval(pollTimer);
    }
  }

  const requestRoomChange = useCallback((roomId: string) => {
    if (cameraTransitioning) return;
    // Once the visitor is inside, navigation is limited to the two interior
    // floors. The exterior is only part of the one-way opening sequence.
    if (roomId !== "room-lobby" && roomId !== PRIVATE_ROOM_ID) return;
    setSelectedId("");
    setFocusPhase("idle");
    setActiveRoom(roomId);
    if (roomId !== PRIVATE_ROOM_ID) {
      setPrivateGateOpen(false);
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setPrivateUnlocked(false);
      setPrivateUnlockedMode("");
    }
  }, [cameraTransitioning]);

  function leavePrivateRoom() {
    if (cameraTransitioning) return;
    setSelectedId("");
    setFocusPhase("idle");
    setActiveRoom("room-lobby");
    if (activeRoom === PRIVATE_ROOM_ID) resetPrivateAccess();
  }

  function unlockPrivateDiary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!privateAccessMode) {
      setPrivatePasswordError("请先选择本人或参观身份。");
      return;
    }
    if (!isValidBedroomPassword(privateAccessMode, privatePassword)) {
      setPrivatePasswordError(`${BEDROOM_ACCESS_COPY[privateAccessMode].label}密码不正确。`);
      return;
    }
    setPrivateUnlocked(true);
    setPrivateUnlockedMode(privateAccessMode);
    setPrivateGateOpen(false);
    setPrivatePasswordError("");
    setPrivatePassword("");
    setSelectedId("bedroom-diary");
  }

  function beginMoveInDraft() {
    setPendingProfile(null);
    setProfileMergeReport(null);
    setMoveInStep("pet");
    setPetCustomization({ ...DEFAULT_PET_CUSTOMIZATION });
    setPrivateFrameImages({});
    setPrivateFrameMessage("");
    setAgentRunEvents([]);
    setAgentRunProfileId("");
  }

  async function extractUrl() {
    const value = url.trim();
    if (!value) return;
    if (!agentReady && agentConfigChecked) {
      setAgentSetupOpen(true);
      setMessage("请先配置 Profile Agent，再解析新的个人网页。");
      return;
    }
    beginMoveInDraft();
    setLoading(true);
    setMessage("Website Research Agent 正在规划并读取公开页面…");
    try {
      const parsed = await parseTextWithAgent("", value, "url", [], value, true);
      acceptParsedProfile(parsed.profile, parsed.mergeReport);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败，请稍后重试。 ");
    } finally {
      setLoading(false);
    }
  }

  async function readFile(file?: File, website?: string) {
    if (!file) return;
    if (!agentReady && agentConfigChecked) {
      setAgentSetupOpen(true);
      setMessage("请先配置 Profile Agent，再上传新的简历。");
      return;
    }
    beginMoveInDraft();
    setLoading(true);
    setMessage(website
      ? "Claude Profile Agent 正在并行读取简历和个人网站…"
      : "Claude Profile Agent 正在读取简历，并准备追踪个人网站…");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("followWebsite", "true");
      if (website) form.set("website", website);
      const { response, data } = await requestTrackedAgentRun<{
        profile?: ParsedProfile;
        mergeReport?: ProfileMergeReport;
        error?: string;
        details?: string[];
        run?: AgentRunSnapshot;
      }>("/api/parse", {
        method: "POST",
        headers: browserAgentConfigHeaders(browserAgentConfig),
        body: form,
      });
      if (!response.ok || !data.profile) {
        throw new Error([data.error, ...(data.details || [])].filter(Boolean).join(" · ") || "Agent 解析失败。");
      }
      setAgentRunProfileId(data.profile.id);
      acceptParsedProfile(data.profile, data.mergeReport);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取这个文件。");
    } finally {
      setLoading(false);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setMessage(`已选择 ${file.name}，确认资料后点击下方生成。`);
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setMessage(`已选择 ${file.name}，确认资料后点击下方生成。`);
  }

  function clearSourceFile() {
    setSourceFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setMessage(url.trim() ? "个人网站已保留，可以直接生成。" : "请选择个人网站或简历，至少提供一种资料。");
  }

  function generateFromSources(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSourceInput || loading) return;
    if (!agentReady && agentConfigChecked) {
      setAgentSetupOpen(true);
      setMessage("请先配置 Profile Agent，再开始生成。 ");
      return;
    }
    const website = url.trim();
    if (sourceFile) {
      void readFile(sourceFile, website || undefined);
      return;
    }
    void extractUrl();
  }

  function openDemo() {
    openWorld(fictionalDemoProfile);
  }

  function saveBrowserAgentConfig(config: BrowserAgentConfig) {
    window.sessionStorage.setItem(BROWSER_AGENT_SESSION_KEY, JSON.stringify(config));
    setBrowserAgentConfig(config);
    setMessage("Agent 配置已保存到当前标签页，可以开始解析。");
    setAgentSetupOpen(false);
  }

  function persistPrivateFrameImages(next: PrivateFrameImages) {
    setPrivateFrameImages(next);
    if (!result) {
      setPrivateFrameMessage("照片已放入入住草稿，进入小家时会和当前 Profile 一起保存。");
      return;
    }
    try {
      writeStoredProfileSpace({
        version: 1,
        profileId: result.profile.id,
        pet: normalizePetCustomization(petCustomization),
        frameImages: next,
      });
      setPrivateFrameMessage("相框图片已保存到当前 Profile。");
    } catch {
      setPrivateFrameMessage("相框已更新，但浏览器存储空间不足，本次只在当前会话保留。");
    }
  }

  async function readPrivateFrameImage(slot: PrivateFrameSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPrivateFrameMessage("正在优化相框图片…");
    try {
      const imageUrl = await resizeProjectCover(file, { maxWidth: 960, maxHeight: 960, quality: 0.78 });
      persistPrivateFrameImages({ ...privateFrameImages, [slot]: imageUrl });
      event.target.value = "";
    } catch (error) {
      setPrivateFrameMessage(error instanceof Error ? error.message : "这张图片无法处理，请换一张再试。");
      event.target.value = "";
    }
  }

  async function readMoveInPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const openSlots = PRIVATE_FRAME_SLOTS.filter((slot) => !privateFrameImages[slot]);
    if (!openSlots.length) {
      setPrivateFrameMessage("6 个相框都已有照片；可以先移除或单独替换其中一张。");
      event.target.value = "";
      return;
    }
    setPrivateFrameMessage("正在优化照片并放入相框…");
    const next = { ...privateFrameImages };
    let added = 0;
    try {
      for (const [index, file] of files.slice(0, openSlots.length).entries()) {
        next[openSlots[index]] = await resizeProjectCover(file, { maxWidth: 960, maxHeight: 960, quality: 0.78 });
        added += 1;
      }
      setPrivateFrameImages(next);
      setPrivateFrameMessage(`已放入 ${added} 张照片；进入小家时会按当前 Profile 保存。`);
    } catch (error) {
      setPrivateFrameImages(next);
      setPrivateFrameMessage(error instanceof Error ? error.message : "有照片无法处理，请换一张再试。");
    } finally {
      event.target.value = "";
    }
  }

  function resetPrivateFrame(slot: PrivateFrameSlot) {
    const next = { ...privateFrameImages };
    delete next[slot];
    persistPrivateFrameImages(next);
  }

  function selectGramophoneMusic(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setGramophoneMessage("请选择浏览器可播放的音频文件。");
      event.target.value = "";
      return;
    }
    gramophoneAudio.current?.pause();
    setGramophonePlaying(false);
    void musicController.current?.start();
    setGramophoneTrackId("local");
    setGramophoneMusicUrl(URL.createObjectURL(file));
    setGramophoneMusicName(file.name);
    setGramophoneMessage("音乐已载入当前会话，尚未自动播放。");
  }

  function selectBundledMusic(trackId: string) {
    const track = musicBoxTrack(trackId);
    if (!track || track.id === gramophoneTrackId) return;
    gramophoneAudio.current?.pause();
    setGramophonePlaying(false);
    void musicController.current?.start();
    setGramophoneTrackId(track.id);
    setGramophoneMusicUrl(track.src);
    setGramophoneMusicName(track.title);
    setGramophoneMessage(`已切换到 ${track.title}，点击播放。`);
    if (gramophoneFileInput.current) gramophoneFileInput.current.value = "";
  }

  async function toggleGramophoneMusic() {
    const audio = gramophoneAudio.current;
    if (!audio || !gramophoneMusicUrl) {
      setGramophoneMessage("当前曲目暂时无法播放，请换一首再试。");
      return;
    }
    if (gramophonePlaying) {
      audio.pause();
      setGramophonePlaying(false);
      void musicController.current?.start();
      return;
    }
    try {
      musicController.current?.stop();
      await audio.play();
      setGramophonePlaying(true);
      setGramophoneMessage("");
    } catch {
      void musicController.current?.start();
      setGramophoneMessage("浏览器暂时无法播放这段音频，请换一个文件再试。");
    }
  }

  function clearGramophoneMusic() {
    gramophoneAudio.current?.pause();
    setGramophonePlaying(false);
    void musicController.current?.start();
    setGramophoneTrackId(DEFAULT_MUSIC_BOX_TRACK.id);
    setGramophoneMusicUrl(DEFAULT_MUSIC_BOX_TRACK.src);
    setGramophoneMusicName(DEFAULT_MUSIC_BOX_TRACK.title);
    setGramophoneMessage("已恢复默认曲目。");
    if (gramophoneFileInput.current) gramophoneFileInput.current.value = "";
  }

  function clearBrowserAgentConfig() {
    window.sessionStorage.removeItem(BROWSER_AGENT_SESSION_KEY);
    setBrowserAgentConfig(null);
    setMessage(agentConfig?.ready ? "已恢复使用服务端 Agent 配置。" : "当前会话配置已清除。");
  }

  const selectWorldObject = useCallback((id: string) => {
    if (id === "bedroom-diary" && activeRoom !== PRIVATE_ROOM_ID) return;
    if (id === "bedroom-diary" && !privateUnlocked) {
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setPrivateGateOpen(true);
      return;
    }
    const selectedExhibit = result?.world.exhibits.find((item) => item.id === id && item.eyebrow === "PROJECT");
    const selectedProject = selectedExhibit
      ? result?.profile.items.find((item) => item.id === selectedExhibit.sourceItemId && item.kind === "project")
      : undefined;
    setProjectEditDraft(selectedProject ? projectEditFromItem(selectedProject) : EMPTY_PROJECT_EDIT);
    setProjectEditMessage("");
    if (PRIVATE_FRAME_SLOTS.includes(id as PrivateFrameSlot)) setPrivateFrameMessage("");
    if (id === GRAMOPHONE_ID) setGramophoneMessage("");
    if (projectImageInput.current) projectImageInput.current.value = "";
    setSelectedId(id);
    const focusable = Boolean(id) && Boolean(
      result?.world.exhibits.some((item) => item.id === id)
      || result?.world.displaySurfaces.some((item) => item.id === id)
      || id === HOBBIES_ID
      || id === SNACKS_ID,
    );
    setFocusPhase(focusable ? "travelling" : "idle");
    setSourceBrowserProjectId(
      id === SOURCE_BROWSER_ID
        ? result?.profile.items.find((item) => item.kind === "project")?.id || ""
        : "",
    );
    setGuestbookError("");
    setDiaryError("");
  }, [activeRoom, privateUnlocked, result]);

  function routeToWorldObject(id: string) {
    if (!result) return;
    if (id === selectedId && focusPhase !== "idle") return;
    const exhibit = result.world.exhibits.find((item) => item.id === id);
    const surface = result.world.displaySurfaces.find((item) => item.id === id);
    // The pipeline keeps resume surfaces public, but the Mardou layout mounts
    // education/experience/works/contact on the upper gallery. Route by the
    // physical placement so adjacent focus navigation uses the real stairs
    // instead of drawing a direct camera line through the upper floor.
    const surfaceRoom = surface
      ? ["profile", "achievement", "skills"].includes(surface.semanticRole || "")
        ? "room-lobby"
        : PRIVATE_ROOM_ID
      : undefined;
    const targetRoom = exhibit?.roomId || surfaceRoom;
    if (targetRoom && targetRoom !== activeRoom) setActiveRoom(targetRoom);
    selectWorldObject(id);
  }

  function selectHeatItem(item: ExhibitHeatItem) {
    // Close the DOM overlay before selecting the 3D object. R3F dispatches
    // its canvas-miss cleanup during the same native click; deferring the
    // selection by one frame prevents that cleanup from immediately
    // cancelling the newly requested camera focus.
    setHeatPanelOpen(false);
    window.requestAnimationFrame(() => routeToWorldObject(item.id));
  }

  const handleExhibitFocusSettled = useCallback((id: string) => {
    if (id !== selectedId) return;
    setFocusPhase("presented");
    setExhibitHeat((current) => {
      if (!current || !current.entries[id]) return current;
      const next = incrementHeatLedger(current, id);
      try {
        window.localStorage.setItem(heatStorageKey(next.profileId), JSON.stringify(next));
      } catch {
        // Demo heat remains usable in memory when browser storage is unavailable.
      }
      return next;
    });
  }, [selectedId]);
  const openPetQa = useCallback(() => setPetQaOpen(true), []);
  const handlePetSpeechStart = useCallback(() => {
    setPetSpeechActive(true);
    musicController.current?.stop();
  }, []);
  const handlePetSpeechEnd = useCallback(() => {
    setPetSpeechActive(false);
    if (sceneReady && !gramophonePlaying) void musicController.current?.start();
  }, [gramophonePlaying, sceneReady]);

  function closeExhibitFocus() {
    setSelectedId("");
    setFocusPhase("idle");
  }

  function focusAdjacentExhibit(direction: -1 | 1) {
    if (!focusableExhibitIds.length || selectedFocusIndex < 0) return;
    const nextIndex = (selectedFocusIndex + direction + focusableExhibitIds.length) % focusableExhibitIds.length;
    routeToWorldObject(focusableExhibitIds[nextIndex]);
  }

  function openSourceBrowser(item?: ProfileItem) {
    if (!result) return;
    const nextItem = item || selectedProjectItem;
    const links = collectSourceLinks(result.profile, nextItem);
    if (!links.length) {
      setProjectEditMessage("当前项目还没有可用的源文件链接，请先补充来源后再试。");
      return;
    }
    setSourceBrowserProjectId(nextItem?.id || "");
    setSelectedId(SOURCE_BROWSER_ID);
  }

  function saveGuestbookEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = guestMessage.trim();
    if (!trimmedMessage) {
      setGuestbookError("写下一句话再保存。");
      return;
    }
    const nextEntry: GuestbookEntry = {
      id: createEntryId(),
      name: guestName.trim() || "匿名访客",
      message: trimmedMessage.slice(0, 160),
      createdAt: new Date().toISOString(),
    };
    const nextEntries = [...guestbookEntries, nextEntry].slice(-24);
    try {
      writeStoredEntries(GUESTBOOK_STORAGE_KEY, nextEntries);
      setGuestbookEntries(nextEntries);
      setGuestName("");
      setGuestMessage("");
      setGuestbookError("");
    } catch {
      setGuestbookError("浏览器存储空间不足，暂时无法保存这条留言。");
    }
  }

  function readDiaryImage(event: ChangeEvent<HTMLInputElement>) {
    if (!diaryWritable) {
      setDiaryError("参观模式只能浏览日记，不能上传图片。");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setDiaryError("请选择图片文件。");
      return;
    }
    if (file.size > MAX_DIARY_IMAGE_BYTES) {
      setDiaryError("为了保证本地保存稳定，图片请控制在 1 MB 以内。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDiaryImage(reader.result);
        setDiaryError("");
      }
    };
    reader.onerror = () => setDiaryError("这张图片无法读取，请换一张再试。");
    reader.readAsDataURL(file);
  }

  function persistDiaryDraft() {
    const nextEntry = diaryEntryFromDraft({
      id: createEntryId(),
      text: diaryText,
      imageDataUrl: diaryImage,
      createdAt: new Date().toISOString(),
    });
    if (!nextEntry) return "empty" as const;
    const nextEntries = appendDiaryEntry(diaryEntries, nextEntry);
    try {
      writeStoredEntries(DIARY_STORAGE_KEY, nextEntries);
      setDiaryEntries(nextEntries);
      setDiaryText("");
      setDiaryImage("");
      setDiaryError("");
      if (diaryImageInput.current) diaryImageInput.current.value = "";
      return "saved" as const;
    } catch {
      setDiaryError("浏览器存储空间不足。删除图片或换一张更小的图片再试。");
      return "error" as const;
    }
  }

  function saveDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!diaryWritable) {
      setDiaryError("参观模式只能浏览日记，不能保存新内容。");
      return;
    }
    if (persistDiaryDraft() === "empty") {
      setDiaryError("写一些文字，或选择一张图片再保存。");
    }
  }

  function enterPendingWorld() {
    if (!pendingProfile) return;
    const profileSpace: ProfileSpaceCustomization = {
      version: 1,
      profileId: pendingProfile.id,
      pet: normalizePetCustomization(petCustomization),
      frameImages: privateFrameImages,
    };
    try {
      writeStoredProfileSpace(profileSpace);
      openWorld(pendingProfile, profileSpace);
    } catch {
      setMoveInStep("photos");
      setPrivateFrameMessage("浏览器存储空间不足，暂时无法永久保存。请减少照片或换更小的图片后重试。");
    }
  }

  async function readProjectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProjectEditMessage("正在优化封面图片…");
    try {
      const imageUrl = await resizeProjectCover(file);
      setProjectEditDraft((current) => ({ ...current, imageUrl }));
      setProjectEditMessage("封面已准备好，保存后会立即更新到项目展岛。");
    } catch (error) {
      setProjectEditMessage(error instanceof Error ? error.message : "这张图片无法处理，请换一张再试。");
      event.target.value = "";
    }
  }

  function saveProjectEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || !selectedProjectItem) return;
    const materialName = selectedProjectItem.contentFamily === "publication" ? "论文" : "项目";
    if (!projectEditDraft.title.trim() || !projectEditDraft.summary.trim()) {
      setProjectEditMessage(`${materialName}标题和完整说明都需要填写。`);
      return;
    }
    if (projectEditDraft.projectUrl && !safeExternalHref(projectEditDraft.projectUrl)) {
      setProjectEditMessage("源文件链接需要是完整的 http:// 或 https:// 地址。 ");
      return;
    }
    const nextEdits = updateProjectEdit(projectEdits, selectedProjectItem.id, projectEditDraft);
    const nextProfile = applyProjectEdits(result.profile, nextEdits);
    setProjectEdits(nextEdits);
    setResult(compileProfile(nextProfile, {
      priorEvents: agentRunProfileId === nextProfile.id ? agentRunEvents : undefined,
    }));
    try {
      writeStoredProjectEdits(result.profile.id, nextEdits);
      setProjectEditMessage(`已保存到当前浏览器，3D ${materialName}素材框已同步生成精简版。`);
    } catch {
      setProjectEditMessage(`3D ${materialName}素材框已更新；浏览器空间不足，本次图片只在当前会话保留。`);
    }
  }

  if (!introComplete && !result && !loading && !pendingProfile) {
    return (
      <>
        <BackgroundMusicController ref={musicController} enabled={false} visible={false} />
        <ProductFlowLanding onEnter={showIntake} />
      </>
    );
  }

  if (!result && (loading || pendingProfile)) {
    const reviewActive = Boolean(profileMergeReport);
    const creationReady = Boolean(pendingProfile && !reviewActive);
    return (
      <main className={`creation-page ${creationReady ? "is-ready" : reviewActive ? "is-reviewing" : "is-parsing"}`}>
        <BackgroundMusicController ref={musicController} enabled={false} visible={false} />
        <header className="minimal-header creation-header">
          <span className="wordmark">ROOM</span>
          <span className="edition">MOVE-IN STUDIO · PROFILE LOCAL</span>
        </header>

        <section className="creation-workspace" aria-label="个人小家创建进度与入住设置">
          <section className="creation-progress" aria-live="polite">
            <span className="creation-index">ROOM / BUILD 01</span>
            <div className={`creation-orbit ${creationReady ? "is-complete" : reviewActive ? "is-review" : ""}`} aria-hidden="true"><span /></div>
            <p className="creation-kicker">{creationReady ? "YOUR HOME IS READY" : reviewActive ? "HUMAN CHECKPOINT" : "PROFILE AGENT IS WORKING"}</p>
            <h1>{creationReady
              ? "你的小家，正在等待你的最后装扮。"
              : reviewActive
                ? "有些信息，应该由你来定。"
                : `Agent 继续搭建，你先捏一个${companionName}。`}</h1>
            <p className="creation-message">{agentRunMessage || message}</p>
            <ol className="creation-steps">
              <li className="is-complete"><span>01</span><div><strong>资料已接收</strong><small>简历与公开信息进入解析队列</small></div></li>
              <li className={loading ? "is-active" : "is-complete"}><span>02</span><div><strong>Agent 解析与整合</strong><small>{agentRunMessage || "项目、经历和个人网站并行整理"}</small></div></li>
              <li className={reviewActive ? "is-active" : creationReady ? "is-complete" : ""}><span>03</span><div><strong>证据冲突确认</strong><small>{reviewActive ? "查看候选值、来源片段并作出决定" : "无冲突时自动通过"}</small></div></li>
              <li className={creationReady && moveInStep === "pet" ? "is-active" : creationReady ? "is-complete" : ""}><span>04</span><div><strong>起名、捏宠物与选性格</strong><small>调整{companionName}的名字、颜色、耳朵、花纹和回答语气</small></div></li>
              <li className={creationReady && moveInStep === "photos" ? "is-active" : ""}><span>05</span><div><strong>上传空间照片</strong><small>最多 6 张，对应二楼现有自由相框</small></div></li>
            </ol>
            <AgentTracePanel events={agentRunEvents} />
            <AgentMetricsPanel />
          </section>

          {profileMergeReport ? (
            <ProfileReviewPanel report={profileMergeReport} onConfirm={confirmProfileReview} />
          ) : (
            <MoveInStudio
              step={moveInStep}
              pet={petCustomization}
              frameImages={privateFrameImages}
              ready={creationReady}
              photoMessage={privateFrameMessage}
              onStepChange={setMoveInStep}
              onPetChange={setPetCustomization}
              onPhotosChange={(event) => void readMoveInPhotos(event)}
              onFrameChange={(slot, event) => void readPrivateFrameImage(slot, event)}
              onFrameRemove={resetPrivateFrame}
              onEnter={enterPendingWorld}
            />
          )}
        </section>

        <footer className="minimal-footer creation-footer">
          <span>Agent builds the public story.</span><span>You shape the companion.</span><span>Photos stay local · Diary starts inside</span>
        </footer>
      </main>
    );
  }

  if (!result) {
    return (
      <main className={`intake-page is-${intakeTransition}`}>
        <BackgroundMusicController ref={musicController} enabled={false} visible={false} />
        <header className="minimal-header">
          <Link className="wordmark intake-wordmark" href="/" aria-label="ROOM home">
            <img src="/assets/blueprint/parts/room-logo.webp" alt="ROOM" width={438} height={160} decoding="async" />
          </Link>
          <div className="header-tools">
            <button className="intake-back" type="button" onClick={returnToStory}><span aria-hidden="true">←</span> 查看流程</button>
            <button
              className={`agent-status-button ${agentReady ? "is-ready" : agentConfigChecked ? "is-missing" : "is-checking"}`}
              type="button"
              onClick={() => setAgentSetupOpen(true)}
            >
              <span className="agent-status-dot" aria-hidden="true" />
              <span className="agent-status-label">
                {browserAgentConfig ? "当前会话已配置" : agentConfig?.ready ? "解析服务已就绪" : agentConfigChecked ? "配置解析服务" : "检测解析服务"}
              </span>
            </button>
            <span className="edition">PRIVATE BETA · 01</span>
          </div>
        </header>

        <section className="intake-hero">
          <div className="hero-index" aria-hidden="true">R/02</div>
          <div className="hero-copy">
            <p className="overline">CREATE / INPUT</p>
            <h1>
              <span>从一份经历，</span>
              <span>开始搭建。</span>
            </h1>
            <p className="intro">
              提交个人网页、简历，或把两者一起交给 ROOM。Agent 会交叉理解你的项目、经历、技能、食物偏好与爱好，再编排成一个可以进入的 3D 小家。
            </p>
            <section className="intake-build-preview" aria-label="资料到空间的生成预览">
              <div className="intake-preview-heading">
                <span>WHAT ROOM WILL BUILD</span>
                <small>{hasSourceInput ? "SOURCE READY" : "WAITING FOR SOURCE"}</small>
              </div>
              <div className="intake-preview-route" aria-hidden="true">
                <span className={url.trim() ? "is-ready" : ""}>WEB</span>
                <i />
                <span className={sourceFile ? "is-ready" : ""}>CV</span>
                <i />
                <strong>ROOM</strong>
              </div>
              <div className="intake-preview-items">
                <div><span>01</span><strong>项目展台</strong><small>作品与成果</small></div>
                <div><span>02</span><strong>经历路径</strong><small>教育与职业</small></div>
                <div><span>03</span><strong>食物陈列</strong><small>喜欢的味道</small></div>
                <div><span>04</span><strong>爱好收藏</strong><small>兴趣与生活方式</small></div>
                <div><span>05</span><strong>小白知识</strong><small>可追问的公开资料</small></div>
              </div>
            </section>
          </div>

          <form className="intake-form" onSubmit={generateFromSources}>
            <div className="intake-form-heading">
              <span>01</span>
              <div><small>SOURCE · 任选一项或同时提供</small><strong>选择你的资料来源</strong></div>
            </div>
            <div className="url-form">
              <label htmlFor="portfolio-url"><span>个人网页</span><small>URL · 可选</small></label>
              <div className="url-row">
                <input
                  id="portfolio-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://yourname.com"
                  autoComplete="url"
                />
                <span className={url.trim() ? "source-ready-mark is-ready" : "source-ready-mark"} aria-hidden="true">✓</span>
              </div>
            </div>

            <div className="or"><span>可以继续补充</span></div>

            <button
              className={`upload-zone ${dragging ? "is-dragging" : ""}`}
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              disabled={loading}
            >
              <span className="upload-icon" aria-hidden="true">{sourceFile ? "✓" : "↑"}</span>
              <span className="upload-title">{sourceFile ? "简历已选择" : "上传简历或作品资料"}</span>
              <span className="upload-note">{sourceFile ? sourceFile.name : "拖到这里，或点击选择 · PDF / 图片 / 常见文本格式"}</span>
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              tabIndex={-1}
              aria-hidden="true"
              accept=".pdf,.txt,.md,.markdown,.html,.htm,.json,.csv,.tsv,.xml,.yaml,.yml,.rtf,.log,.jpg,.jpeg,.png,.gif,.webp,application/pdf,text/*,image/jpeg,image/png,image/gif,image/webp"
              onChange={upload}
            />
            {sourceFile ? (
              <div className="source-file-row" aria-live="polite">
                <span><strong>{sourceFile.name}</strong><small>{Math.max(1, Math.ceil(sourceFile.size / 1024))} KB</small></span>
                <button type="button" onClick={clearSourceFile}>移除</button>
              </div>
            ) : null}
            <p className="intake-portrait-disclosure">
              如果资料中识别到头像，ROOM 会自动把它发送至图像服务生成抽象肖像；真人照片不会作为展厅内容展示。
            </p>

            <button className="intake-generate" type="submit" disabled={loading || !hasSourceInput}>
              <span>
                <small>{sourceFile && url.trim() ? "网站 + 简历" : sourceFile ? "简历" : url.trim() ? "个人网站" : "至少选择一项资料"}</small>
                <strong>{loading ? "Agent 正在搭建" : "生成我的 ROOM"}</strong>
              </span>
              <span aria-hidden="true">{loading ? "···" : "→"}</span>
            </button>

            <div className={`form-message ${message ? "is-visible" : ""}`} aria-live="polite">
              {loading ? <span className="loading-mark" aria-hidden="true" /> : null}
              {message}
            </div>
            <section className="demo-resumes" aria-labelledby="demo-resume-title">
              <div className="demo-heading">
                <span id="demo-resume-title">DEMO / 最近生成</span>
                <small>{savedProfiles.length ? `${savedProfiles.length} 个已保存空间` : "解析后会自动保存在这里"}</small>
              </div>
              <div className="demo-profile-list">
                {savedProfiles.map((record) => {
                  const stats = profileStats(record.profile);
                  return (
                    <article className="demo-panel demo-saved" key={record.profile.id}>
                      <div className="demo-person">
                        <span>{record.profile.name.trim().slice(0, 1) || "R"}</span>
                        <div><strong>{record.profile.name}</strong><small>{record.profile.headline || record.profile.source.label}</small></div>
                      </div>
                      <p>{stats.projects} 个项目 · {stats.journey} 段经历与教育 · {stats.skills} 项技能 · {stats.achievements} 项成就</p>
                      <button type="button" disabled={loading} onClick={() => openWorld(record.profile)}>
                        重新进入这个小家 <span aria-hidden="true">→</span>
                      </button>
                    </article>
                  );
                })}
                <article className="demo-panel demo-single">
                  <div className="demo-person">
                    <span>林</span>
                    <div><strong>林澈 <em>虚构 Demo</em></strong><small>创意技术 · AI 体验设计</small></div>
                  </div>
                  <p>{fictionalDemoStats.projects} 个项目 · {fictionalDemoStats.journey} 段经历与教育 · {fictionalDemoStats.skills} 项技能 · {fictionalDemoStats.achievements} 项成就</p>
                  <button type="button" disabled={loading} onClick={openDemo}>
                    进入林澈的博物馆 <span aria-hidden="true">→</span>
                  </button>
                </article>
              </div>
            </section>
          </form>
        </section>

        {agentSetupOpen ? (
          <AgentSetupDialog
            key={browserAgentConfig ? "configured" : "unconfigured"}
            status={agentConfig}
            config={browserAgentConfig}
            onClose={() => setAgentSetupOpen(false)}
            onSave={saveBrowserAgentConfig}
            onClear={clearBrowserAgentConfig}
          />
        ) : null}

        <footer className="minimal-footer">
          <span>One source in.</span>
          <span>One world out.</span>
          <span>1 profile · 1 public gallery · 1 private upper gallery</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="world-page">
      <BackgroundMusicController ref={musicController} enabled={sceneReady} />
      <section
        className={`world-stage ${sceneReady ? "is-ready" : "is-loading"}`}
        aria-label={`${result.profile.name} 的 3D 个人世界`}
        data-selected-world-object={selectedId || undefined}
        data-focus-phase={focusPhase}
      >
        <div className="scene-loading-screen" aria-live="polite" aria-hidden={sceneReady}>
          <div className="scene-loading-brand">ROOM / BUILD</div>
          {sceneReady
            ? <div className="scene-loading-complete" aria-hidden="true">✓</div>
            : <div className="scene-loading-spinner" aria-hidden="true"><span /></div>}
          <strong>{displayedSceneProgress}%</strong>
          <div className="scene-loading-track" aria-hidden="true"><span style={{ width: `${displayedSceneProgress}%` }} /></div>
          <p>
            {sceneLoadState?.errors
              ? "部分独立装饰未加载，基础房间仍可正常进入"
              : !portraitGenerationSettled
                ? "正在创作抽象肖像，真人照片不会出现在展厅"
                : sceneCommitted
                  ? "正在确认最后一帧与缓存状态"
                  : "正在组装材质、灯光与个人展品"}
          </p>
        </div>
        <button className="home-return" type="button" onClick={returnToIntake}>
          <span aria-hidden="true">←</span> 返回主页面
        </button>
        <WorldCanvas
          world={result.world}
          petCustomization={petCustomization}
          activeRoom={activeRoom}
          sceneReady={sceneReady}
          selectedExhibit={selectedId}
          guestbookMessages={guestbookEntries.map((entry) => entry.message)}
          privateFrameImages={displayedPrivateFrameImages}
          petQaOpen={petQaOpen}
          onSelect={selectWorldObject}
          onRoomChange={requestRoomChange}
          onLoadProgress={handleSceneProgress}
          onLoadState={handleSceneLoadState}
          onReady={handleSceneReady}
          onFocusSettled={handleExhibitFocusSettled}
          onTransitionStateChange={setCameraTransitioning}
          onOpenPetQa={openPetQa}
          onStairProximityChange={setStairNavigationNearby}
        />
        <audio
          ref={gramophoneAudio}
          src={gramophoneMusicUrl || undefined}
          loop
          preload="metadata"
          onEnded={() => {
            setGramophonePlaying(false);
            void musicController.current?.start();
          }}
          aria-label="展厅留声机音频"
        />

        <ExhibitHeatPanel
          items={visibleHeatItems}
          open={heatPanelOpen}
          onToggle={() => setHeatPanelOpen((value) => !value)}
          onSelect={selectHeatItem}
        />

        <button
          className="companion-qa-launch"
          type="button"
          onClick={openPetQa}
          aria-expanded={petQaOpen}
          aria-controls="pet-qa-panel"
        >
          <span aria-hidden="true">◇</span>
          问问{companionName}
        </button>

        <div className={`private-gate ${privateGateOpen ? "is-open" : ""}`} aria-hidden={!privateGateOpen}>
          {privateGateOpen ? (
            <section className="private-gate-card" role="dialog" aria-modal="true" aria-labelledby="private-gate-title">
              <p>PRIVATE AREA · 01</p>
              <h2 id="private-gate-title">打开私人日记</h2>
              <div className="private-gate-copy">二楼空间可以直接参观；打开桌上的日记本时需要选择身份。本人可以写入本机日记，参观者只能阅读已保存内容。</div>
              <form onSubmit={unlockPrivateDiary}>
                <fieldset className="private-mode-picker" aria-label="选择日记本访问身份">
                  {(Object.entries(BEDROOM_ACCESS_COPY) as [BedroomAccessMode, typeof BEDROOM_ACCESS_COPY[BedroomAccessMode]][]).map(([mode, copy]) => (
                    <button
                      key={mode}
                      type="button"
                      className={privateAccessMode === mode ? "is-selected" : ""}
                      onClick={() => {
                        setPrivateAccessMode(mode);
                        setPrivatePassword("");
                        setPrivatePasswordError("");
                      }}
                      aria-pressed={privateAccessMode === mode}
                    >
                      <strong>{copy.label}</strong>
                      <span>{copy.description}</span>
                    </button>
                  ))}
                </fieldset>
                <label htmlFor="private-room-password">访问密码</label>
                <input
                  id="private-room-password"
                  type="password"
                  value={privatePassword}
                  onChange={(event) => {
                    setPrivatePassword(event.target.value);
                    setPrivatePasswordError("");
                  }}
                  autoComplete="off"
                  autoFocus
                  disabled={!privateAccessMode}
                  aria-describedby="private-password-hint private-password-error"
                />
                <small id="private-password-hint">
                  当前本地 Demo：本人 {OWNER_PRIVATE_PASSWORD} · 参观 {VISITOR_PRIVATE_PASSWORD}
                </small>
                <div id="private-password-error" className="private-gate-error" aria-live="polite">{privatePasswordError}</div>
                <div className="private-gate-actions">
                  <button type="button" onClick={resetPrivateAccess}>取消</button>
                  <button type="submit" disabled={!privateAccessMode}>以{privateAccessMode ? BEDROOM_ACCESS_COPY[privateAccessMode].label : "所选身份"}身份打开</button>
                </div>
              </form>
            </section>
          ) : null}
        </div>

        <nav className="journey-nav" aria-label="空间导航">
          {activeRoom === "exterior" ? (
            <span className="journey-primary">点击画面中的入口 · 进入主展厅</span>
          ) : (
            <>
              {activeRoom !== "room-lobby" && stairNavigationNearby && !cameraTransitioning ? (
                <button
                  type="button"
                  disabled={cameraTransitioning}
                  onClick={leavePrivateRoom}
                >
                  ← 返回主展厅
                </button>
              ) : null}
              {activeRoom === PRIVATE_ROOM_ID ? (
                <button type="button" disabled={cameraTransitioning} onClick={() => { setSelectedId(PRIVATE_FRAME_SLOTS[0]); setPrivateFrameMessage(""); }}>
                  管理二楼自由相框
                </button>
              ) : null}
              {activeRoom === "room-lobby" && stairNavigationNearby && !cameraTransitioning ? (
                <button type="button" disabled={cameraTransitioning} onClick={() => requestRoomChange(PRIVATE_ROOM_ID)}>
                  二层展区 · 直接进入
                </button>
              ) : null}
            </>
          )}
        </nav>

        <ExhibitFocusScreen
          open={Boolean(selectedDetail && focusPhase === "presented")}
          title={selectedDetail?.title || ""}
          exhibitType={selectedDetail?.eyebrow || "SHOWROOM"}
          body={selectedDetail?.body}
          sections={selectedDetail?.sections}
          image={selectedDetail?.imageUrl ? { src: selectedDetail.imageUrl, alt: `${selectedDetail.title} 展台图片` } : undefined}
          sourceLinks={selectedDetail?.sourceUrl ? [{ label: "在来源终端打开源文件 ↗", url: selectedDetail.sourceUrl }] : []}
          currentIndex={selectedFocusIndex >= 0 ? selectedFocusIndex : undefined}
          totalCount={focusableExhibitIds.length}
          onClose={closeExhibitFocus}
          onPrevious={selectedFocusIndex >= 0 ? () => focusAdjacentExhibit(-1) : undefined}
          onNext={selectedFocusIndex >= 0 ? () => focusAdjacentExhibit(1) : undefined}
          projectEditSlot={selectedDetail && (
            (portraitDetailSelected && originalPortraitUrl)
            || selectedDetail.editableProject
            || selectedDetail.metadata?.length
          ) ? (
            <>
              {portraitDetailSelected && originalPortraitUrl ? (
                <section className="portrait-art-control" aria-labelledby="portrait-art-title">
                  <div className="portrait-art-heading">
                    <div>
                      <strong id="portrait-art-title">抽象肖像</strong>
                      <span>AI ABSTRACT ART · ALWAYS ON</span>
                    </div>
                    {visiblePortraitUrl ? (
                      <Image
                        src={visiblePortraitUrl}
                        alt={`${result.profile.name} 的 AI 抽象肖像`}
                        width={64}
                        height={64}
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <p className="portrait-art-privacy">
                    展厅只展示抽象画。原始照片仅用于生成，不会作为展品出现；生成图本次仅保留在当前会话。
                  </p>
                  <button
                    className="portrait-art-generate"
                    type="button"
                    disabled={portraitArtStatus === "generating"}
                    onClick={() => void generateAbstractPortrait()}
                  >
                    {portraitArtStatus === "generating"
                      ? "正在生成…"
                      : portraitArtStatus === "error"
                        ? "重试生成"
                        : "重新生成一幅"}
                  </button>
                  <div
                    className={`portrait-art-message ${portraitArtStatus === "error" ? "is-error" : ""}`}
                    aria-live="polite"
                  >
                    {portraitArtMessage || "有趣的黑白解构面孔：能看出五官暗示，但位置、比例和线条都不写实。"}
                  </div>
                </section>
              ) : null}
              {selectedDetail.editableProject && selectedProjectItem ? (
                <form className="project-editor" onSubmit={saveProjectEdit}>
                  <div className="project-editor-heading">
                    <strong>{selectedMaterialIsPublication ? "EDIT PAPER MATERIAL" : "EDIT THIS MATERIAL"}</strong>
                    <span>展框自动精简 · 完整资料保留</span>
                  </div>
                  <label htmlFor="project-edit-title">{selectedMaterialIsPublication ? "论文完整标题" : "项目名称"}</label>
                  <input
                    id="project-edit-title"
                    value={projectEditDraft.title}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, title: event.target.value }))}
                    maxLength={selectedMaterialIsPublication ? 300 : 120}
                  />
                  <label htmlFor="project-edit-summary">{selectedMaterialIsPublication ? "论文完整说明" : "项目完整说明"}</label>
                  <textarea
                    id="project-edit-summary"
                    value={projectEditDraft.summary}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, summary: event.target.value }))}
                    maxLength={selectedMaterialIsPublication ? 4000 : 900}
                    rows={5}
                  />
                  <label htmlFor="project-edit-source">{selectedMaterialIsPublication ? "论文 / 来源链接" : "源文件 / 项目链接"}</label>
                  <input
                    id="project-edit-source"
                    type="url"
                    value={projectEditDraft.projectUrl || ""}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, projectUrl: event.target.value }))}
                    placeholder="https://github.com/you/project"
                  />
                  <div className="project-cover-upload">
                    <label htmlFor="project-edit-image">素材框封面</label>
                    <input ref={projectImageInput} id="project-edit-image" type="file" accept="image/*" onChange={(event) => void readProjectImage(event)} />
                    <span>原始插图保持不变，仅文字展签自动精简</span>
                  </div>
                  {projectEditDraft.imageUrl ? (
                    <Image className="project-cover-preview" src={projectEditDraft.imageUrl} alt="项目展岛封面预览" width={320} height={190} unoptimized />
                  ) : null}
                  <div className="project-edit-message" aria-live="polite">{projectEditMessage}</div>
                  <button type="submit">保存并更新素材框</button>
                </form>
              ) : null}
              {selectedDetail.editableProject ? (
                <button className="project-open-source-btn" type="button" onClick={() => openSourceBrowser(selectedProjectItem)}>
                  在来源终端打开源文件
                </button>
              ) : null}
              {selectedDetail.metadata?.length ? (
                <dl className="detail-meta" aria-label="项目元数据">
                  {selectedDetail.metadata.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : null}
        />

        <PetQaPanel
          profile={result.profile}
          config={browserAgentConfig}
          name={companionName}
          personality={petCustomization.personality}
          open={petQaOpen}
          onClose={() => setPetQaOpen(false)}
          onSpeechStart={handlePetSpeechStart}
          onSpeechEnd={handlePetSpeechEnd}
        />

        <aside className={`memory-panel ${selectedId === "showroom-guestbook" ? "is-open" : ""}`} aria-hidden={selectedId !== "showroom-guestbook"}>
          {selectedId === "showroom-guestbook" ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭访客签到台">×</button>
              <p>VISITOR CORNER</p>
              <h2>在展厅留句话</h2>
              <div className="memory-description">留言会保存在这台浏览器中，并立即变成 3D 签到簿旁的便签。</div>
              <form className="memory-form" onSubmit={saveGuestbookEntry}>
                <label htmlFor="guest-name">名字</label>
                <input id="guest-name" value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="匿名访客" maxLength={32} />
                <label htmlFor="guest-message">留言</label>
                <textarea id="guest-message" value={guestMessage} onChange={(event) => { setGuestMessage(event.target.value); setGuestbookError(""); }} placeholder="这个小家让你想到什么？" maxLength={160} rows={4} />
                <div className="memory-error" aria-live="polite">{guestbookError}</div>
                <button type="submit">写入签到簿</button>
              </form>
              <div className="memory-entries" aria-label="最近留言">
                {guestbookEntries.length ? guestbookEntries.slice(-4).reverse().map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.name}</strong>
                    <p>{entry.message}</p>
                  </article>
                )) : <span>还没有留言。</span>}
              </div>
            </>
          ) : null}
        </aside>

        <aside
          className={`memory-panel source-browser-panel ${selectedId === SOURCE_BROWSER_ID ? "is-open" : ""}`}
          aria-hidden={selectedId !== SOURCE_BROWSER_ID}
        >
          {selectedId === SOURCE_BROWSER_ID ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭源码终端">×</button>
              <p>SOURCE ARCHIVE</p>
              <h2>项目来源终端</h2>
              <div className="memory-description">选中的项目在这里收敛为可访问的源文件入口。</div>
              {sourceBrowserLinks.length ? (
                <ul className="source-browser-links">
                  {sourceBrowserLinks.map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        <strong>{link.label}</strong>
                        <span>{link.url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="memory-description">当前还没有可用的源文件链接。</span>
              )}
            </>
          ) : null}
        </aside>

        <aside
          className={`memory-panel gramophone-panel ${selectedId === GRAMOPHONE_ID ? "is-open" : ""}`}
          aria-hidden={selectedId !== GRAMOPHONE_ID}
        >
          {selectedId === GRAMOPHONE_ID ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭留声机设置">×</button>
              <p>MUSEUM GRAMOPHONE</p>
              <h2>展厅音乐</h2>
              <div className="memory-description">
                已内置三首 CC0 无歌词循环音乐，可以随时切换；也可以选择一段仅在当前页面播放的本地音频。
              </div>
              <section className="gramophone-controls">
                <div className="gramophone-track">
                  <span>当前曲目</span>
                  <strong>{gramophoneMusicName || "未设置音乐"}</strong>
                </div>
                <div className="gramophone-library" aria-label="默认开源音乐">
                  {MUSIC_BOX_TRACKS.map((track, index) => (
                    <button
                      key={track.id}
                      className={gramophoneTrackId === track.id ? "is-active" : ""}
                      type="button"
                      onClick={() => selectBundledMusic(track.id)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{track.title}</strong><small>{track.artist} · {track.license}</small></div>
                    </button>
                  ))}
                </div>
                {musicBoxTrack(gramophoneTrackId) ? (
                  <a className="gramophone-license" href={musicBoxTrack(gramophoneTrackId)?.sourceUrl} target="_blank" rel="noreferrer">
                    查看当前曲目来源与 CC0 许可 ↗
                  </a>
                ) : null}
                <label className="picture-file-button" htmlFor="gramophone-file">选择本地音频</label>
                <input
                  ref={gramophoneFileInput}
                  id="gramophone-file"
                  type="file"
                  accept="audio/*"
                  onChange={selectGramophoneMusic}
                />
                <label className="gramophone-volume" htmlFor="gramophone-volume">
                  <span>音量</span>
                  <strong>{Math.round(gramophoneVolume * 100)}%</strong>
                </label>
                <input
                  id="gramophone-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={gramophoneVolume}
                  onChange={(event) => setGramophoneVolume(Number(event.target.value))}
                />
                <div className="gramophone-actions">
                  <button type="button" onClick={() => void toggleGramophoneMusic()} disabled={!gramophoneMusicUrl}>
                    {gramophonePlaying ? "暂停" : "播放"}
                  </button>
                  <button type="button" onClick={clearGramophoneMusic} disabled={gramophoneTrackId === DEFAULT_MUSIC_BOX_TRACK.id}>恢复默认</button>
                </div>
              </section>
              <div className="memory-error" aria-live="polite">{gramophoneMessage}</div>
            </>
          ) : null}
        </aside>

        <aside
          className={`memory-panel picture-config-panel ${selectedPrivateFrameSlot ? "is-open" : ""}`}
          aria-hidden={!selectedPrivateFrameSlot}
        >
          {selectedPrivateFrameSlot ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭自由相框设置">×</button>
              <p>PRIVATE GALLERY FRAME</p>
              <h2>二楼自由相框</h2>
              <div className="memory-description">
                {result.profile.id === FICTIONAL_DEMO_PROFILE_ID
                  ? "林澈 Demo 已内置三张相框图片；选择本地图片后可在当前浏览器覆盖默认图。"
                  : "这个墙面相框默认为空。选择一张本地图片后会即时显示，图片只保存在当前浏览器。"}
              </div>
              <div className="private-frame-tabs" role="group" aria-label="选择二楼相框">
                {PRIVATE_FRAME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={selectedPrivateFrameSlot === slot ? "is-active" : ""}
                    onClick={() => { setSelectedId(slot); setPrivateFrameMessage(""); }}
                  >
                    {slot.replace("private-frame-", "相框 ")}
                  </button>
                ))}
              </div>
              <section className="picture-config-card private-frame-config-card">
                <header>
                  <strong>{selectedPrivateFrameSlot.replace("private-frame-", "FRAME ")}</strong>
                  <span>{displayedPrivateFrameImages[selectedPrivateFrameSlot] ? "已保存图片" : "空相框"}</span>
                </header>
                {displayedPrivateFrameImages[selectedPrivateFrameSlot] ? (
                  <img
                    src={displayedPrivateFrameImages[selectedPrivateFrameSlot]}
                    alt="当前相框图片预览"
                  />
                ) : <div className="private-frame-empty-preview">EMPTY FRAME</div>}
                <label className="picture-file-button" htmlFor={`private-frame-file-${selectedPrivateFrameSlot}`}>选择本地图片</label>
                <input
                  id={`private-frame-file-${selectedPrivateFrameSlot}`}
                  type="file"
                  accept="image/*"
                  onChange={(event) => void readPrivateFrameImage(selectedPrivateFrameSlot, event)}
                />
                <button type="button" className="private-frame-reset" onClick={() => resetPrivateFrame(selectedPrivateFrameSlot)}>
                  {result.profile.id === FICTIONAL_DEMO_PROFILE_ID ? "恢复 Demo 默认图" : "恢复为空相框"}
                </button>
              </section>
              <div className="memory-error" aria-live="polite">{privateFrameMessage}</div>
            </>
          ) : null}
        </aside>

        <aside className={`memory-panel diary-panel ${selectedId === "bedroom-diary" ? "is-open" : ""}`} aria-hidden={selectedId !== "bedroom-diary"}>
          {selectedId === "bedroom-diary" ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭私人日记">×</button>
              <p>PRIVATE DIARY</p>
              <h2>{diaryWritable ? "今天想留下什么？" : "参观日记陈列"}</h2>
              <div className="memory-description">
                {diaryWritable
                  ? "本人模式可新增文字和图片；内容只保存在当前浏览器，不会上传到服务器。"
                  : "参观模式只能浏览已保存日记；写入、上传和保存控件不会开放。"}
              </div>
              {diaryWritable ? (
                <form className="memory-form" onSubmit={saveDiaryEntry}>
                  <label htmlFor="diary-text">文字记录</label>
                  <textarea
                    id="diary-text"
                    value={diaryText}
                    onChange={(event) => { setDiaryText(event.target.value); setDiaryError(""); }}
                    placeholder="写下一段只属于自己的记录……"
                    maxLength={MAX_DIARY_TEXT_LENGTH}
                    rows={5}
                  />
                  <div className="diary-upload-row">
                    <input ref={diaryImageInput} id="diary-image" type="file" accept="image/*" onChange={readDiaryImage} />
                    <span>图片上限 1 MB</span>
                  </div>
                  {diaryImage ? <Image className="diary-preview" src={diaryImage} alt="即将保存的日记图片预览" width={320} height={200} unoptimized /> : null}
                  <div className="memory-error" aria-live="polite">{diaryError}</div>
                  <button type="submit">保存这页日记</button>
                </form>
              ) : (
                <div className="diary-readonly-note" role="status">
                  当前身份：参观 · 只读浏览 · 本地内容不会上传
                </div>
              )}
              <div className="memory-entries diary-entries" aria-label="已保存的日记">
                {diaryEntries.length ? diaryEntries.slice().reverse().map((entry) => (
                  <article key={entry.id}>
                    <time>{new Date(entry.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                    {entry.imageDataUrl ? <Image src={entry.imageDataUrl} alt="日记图片" width={320} height={180} unoptimized /> : null}
                    {entry.text ? <p>{entry.text}</p> : null}
                  </article>
                )) : <span>日记本还是空的。</span>}
              </div>
            </>
          ) : null}
        </aside>

        <div className={`world-hint ${selectedId ? "is-selection" : ""}`}>
          {activeRoom === "exterior"
            ? "打开前门 · 镜头会连续穿过门槛"
            : activeRoom === "room-lobby"
              ? selectedId
                ? "视角已跟随到这件展品 · 按 Esc 或点击空白退出聚焦"
                : "WASD 移动 · Q / E 单击 45°、长按持续旋转 · R 广角后退 · 鼠标靠近边缘持续环视 · 右键锁定/解除视角 · 点击展品或楼梯"
              : selectedId === "bedroom-diary"
                ? diaryWritable
                  ? "本人日记已打开 · 可写入本机浏览器"
                  : "参观日记已打开 · 只读浏览"
                : "WASD 移动 · Q / E 单击 45°、长按持续旋转 · R 广角后退 · 鼠标靠近边缘持续环视 · 右键锁定/解除视角 · 点击桌上的日记本"}
        </div>
      </section>
    </main>
  );
}
