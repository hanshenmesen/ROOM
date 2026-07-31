"use client";

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
import type { PublicAgentConfigStatus } from "@/lib/agents/provider-config";
import {
  BROWSER_AGENT_SESSION_KEY,
  browserAgentConfigHeaders,
  normalizeBrowserAgentConfig,
  type BrowserAgentConfig,
} from "@/lib/browser-agent-config";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import { hanchenDemoProfile } from "@/lib/data/hanchen-demo-profile";
import {
  applyProjectEdits,
  projectEditFromItem,
  updateProjectEdit,
  type ProjectEdit,
  type ProjectEdits,
} from "@/lib/project-edits";
import type { ContentFamily, ParsedProfile, PipelineResult, ProfileItem, SourceEvidence } from "@/lib/types";
import {
  beginSceneLoading,
  type SceneLoadingSnapshot,
} from "./SceneLoadingStore";
import { AgentSetupDialog } from "./AgentSetupDialog";

const WorldCanvas = dynamic(
  () => import("./WorldCanvas").then((module) => module.WorldCanvas),
  { ssr: false },
);

const PRIVATE_ROOM_ID = "room-private";
const PROJECTS_PER_PAGE = 4;
const OWNER_PRIVATE_PASSWORD = "owner2026";
const VISITOR_PRIVATE_PASSWORD = "visit2026";
const GUESTBOOK_STORAGE_KEY = "room:guestbook:v1";
const DIARY_STORAGE_KEY = "room:diary:v1";
const SOURCE_BROWSER_ID = "showroom-source-browser";
const PROJECT_EDITS_STORAGE_PREFIX = "room:project-edits:v1:";
const EMPTY_PROJECT_EDIT: ProjectEdit = { title: "", summary: "" };
const hanchenDemoStats = {
  projects: hanchenDemoProfile.items.filter((item) => item.kind === "project").length,
  journey: hanchenDemoProfile.items.filter((item) => ["experience", "education"].includes(item.kind)).length,
  skills: hanchenDemoProfile.skills.length,
  achievements: hanchenDemoProfile.items.filter((item) => item.kind === "achievement").length,
};
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

type DiaryEntry = {
  id: string;
  text: string;
  imageDataUrl?: string;
  createdAt: string;
};

type BedroomAccessMode = "owner" | "visitor";

export const BEDROOM_ACCESS_COPY: Record<BedroomAccessMode, { label: string; password: string; canEditDiary: boolean; description: string }> = {
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

export function canEditPrivateDiary(mode: BedroomAccessMode | "") {
  return mode === "owner";
}

export function isValidBedroomPassword(mode: BedroomAccessMode | "", password: string) {
  return Boolean(mode) && BEDROOM_ACCESS_COPY[mode as BedroomAccessMode].password === password;
}

type SelectedDetail = {
  eyebrow: string;
  title: string;
  body: string;
  sourceItemId?: string;
  imageUrl?: string;
  editableProject?: boolean;
  metadata?: {
    label: string;
    value: string;
    evidence?: string;
  }[];
  source: string;
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

function formatSourceLabel(profileType: "url" | "text", evidenceOrLocator?: SourceEvidence | string) {
  if (typeof evidenceOrLocator === "object" && evidenceOrLocator.origin === "system-generated") {
    return "系统生成占位 · 非原始来源";
  }
  const locator = typeof evidenceOrLocator === "string" ? evidenceOrLocator : evidenceOrLocator?.locator;
  const sourceLabel = profileType === "url" ? "公开网页" : "原始简历";
  return locator ? `来源定位：${locator} · 来自${sourceLabel}` : `来源定位：未定位 · 来自${sourceLabel}`;
}

function formatCollectionSourceLabel(profileType: "url" | "text") {
  return `逐项来源定位见正文 · 来自${profileType === "url" ? "公开网页" : "原始简历"}`;
}

function appendLocation(headline: string, location?: string) {
  if (!location || headline.toLocaleLowerCase().includes(location.toLocaleLowerCase())) return headline;
  return `${headline} · ${location}`;
}

function formatContactLines(contacts: string[], contactEvidence: Record<string, SourceEvidence[]>) {
  return contacts.length
    ? contacts.map((contact) => {
      const locator = contactEvidence[contact]?.[0]?.locator;
      return `${contact} (${locator ? `${locator}` : "来源定位缺失"})`;
    }).join("\n")
    : "暂无可展示的联系方式。";
}

function formatJourneyDetail(item: ProfileItem) {
  const heading = `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
  const sameAsHeading = item.summary.replace(/\s+/g, " ").trim() === heading.replace(/\s+/g, " ").trim();
  return [
    heading,
    sameAsHeading ? "" : item.summary,
    `证据定位：${item.evidence[0]?.locator || "未定位"}`,
  ].filter(Boolean).join("\n");
}

function readStoredEntries<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T[] : [];
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

function resizeProjectCover(file: File) {
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
        const maxWidth = 1440;
        const maxHeight = 960;
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
        resolve(canvas.toDataURL("image/jpeg", 0.84));
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
  const evidence = item.evidence[0]?.locator;
  return [
    `[${label}] ${item.title}`,
    item.subtitle,
    item.summary,
    item.tags.length ? `关键词：${item.tags.join(" · ")}` : "",
    item.sourceUrl ? `原始来源：${item.sourceUrl}` : "",
    evidence ? `证据定位：${evidence}` : "",
  ].filter(Boolean).join("\n");
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
    item.projectUrl ? `项目链接：${item.projectUrl}` : item.sourceUrl ? `原始来源：${item.sourceUrl}` : "",
    `证据定位：${item.evidence[0]?.locator || "未定位"}`,
  ].filter(Boolean).join("\n");
}

function projectMetadataForDetail(exhibit: PipelineResult["world"]["exhibits"][number]) {
  const metadata: NonNullable<SelectedDetail["metadata"]> = [];
  if (exhibit.timeRange) {
    metadata.push({
      label: "时间",
      value: exhibit.timeRange,
      evidence: exhibit.fieldEvidence?.timeRange?.[0]?.locator,
    });
  }
  if (exhibit.role) {
    metadata.push({
      label: "角色",
      value: exhibit.role,
      evidence: exhibit.fieldEvidence?.role?.[0]?.locator,
    });
  }
  if (exhibit.techStack?.length) {
    metadata.push({
      label: "技术栈",
      value: exhibit.techStack.join(" · "),
      evidence: exhibit.fieldEvidence?.techStack?.[0]?.locator,
    });
  }
  if (exhibit.projectUrl) {
    metadata.push({
      label: "项目链接",
      value: exhibit.projectUrl,
      evidence: exhibit.fieldEvidence?.projectUrl?.[0]?.locator,
    });
  }
  return metadata;
}

function DetailBody({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="detail-text">
      {lines.map((line, index) => {
        const url = line.match(/https?:\/\/[^\s]+/i)?.[0];
        const email = line.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
        const href = url || (email ? `mailto:${email}` : undefined);
        return (
          <span key={`${index}-${line.slice(0, 24)}`}>
            {href ? <a href={href} target={url ? "_blank" : undefined} rel={url ? "noreferrer" : undefined}>{line}</a> : line}
            {index < lines.length - 1 ? <br /> : null}
          </span>
        );
      })}
    </div>
  );
}

async function fetchAgentConfigStatus() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error("configuration status unavailable");
  return response.json() as Promise<PublicAgentConfigStatus>;
}

export function RoomStudio() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [agentConfig, setAgentConfig] = useState<PublicAgentConfigStatus | null>(null);
  const [browserAgentConfig, setBrowserAgentConfig] = useState<BrowserAgentConfig | null>(null);
  const [agentConfigChecked, setAgentConfigChecked] = useState(false);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLoadState, setSceneLoadState] = useState<SceneLoadingSnapshot | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeRoom, setActiveRoom] = useState("room-lobby");
  const [projectPage, setProjectPage] = useState(0);
  const [selectedId, setSelectedId] = useState("");
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
  const fileInput = useRef<HTMLInputElement>(null);
  const diaryImageInput = useRef<HTMLInputElement>(null);
  const projectImageInput = useRef<HTMLInputElement>(null);
  const sceneReadyTimer = useRef<number | null>(null);
  const projectCount = result?.world.exhibits.filter((item) => item.eyebrow === "PROJECT").length || 0;
  const projectPageCount = Math.max(1, Math.ceil(projectCount / PROJECTS_PER_PAGE));
  const diaryWritable = canEditPrivateDiary(privateUnlockedMode);
  const agentReady = Boolean(
    browserAgentConfig?.maas.apiKey || browserAgentConfig?.website.apiKey || agentConfig?.ready,
  );
  const selectedDetail = useMemo<SelectedDetail | undefined>(() => {
    if (!result || !selectedId || selectedId === "showroom-guestbook" || selectedId === "bedroom-diary") return undefined;
    const sourceType = result.profile.source.type;
    const exhibit = result.world.exhibits.find((item) => item.id === selectedId);
    if (exhibit) {
      return {
        eyebrow: exhibit.eyebrow,
        title: exhibit.title,
        body: exhibit.body,
        sourceItemId: exhibit.sourceItemId,
        imageUrl: exhibit.imageUrl,
        editableProject: exhibit.eyebrow === "PROJECT",
        metadata: projectMetadataForDetail(exhibit),
        source: formatSourceLabel(sourceType, exhibit.evidence[0]),
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
        source: formatSourceLabel(
          sourceType,
          Array.from(
            new Set(
              ["name", "headline", "location", "summary"]
                .flatMap((field) => result.profile.identityEvidence[field as keyof typeof result.profile.identityEvidence] || [])
                .map((item) => item.locator),
            ),
          ).join(" · ") || undefined,
        ),
        sourceUrl,
      };
    }
    if (surface.semanticRole === "skills") {
      const skills = surface.sourceItemIds
        .filter((sourceId) => sourceId.startsWith("skill:"))
        .map((sourceId) => sourceId.slice("skill:".length));
      return {
        eyebrow: eyebrowByRole.skills,
        title: surface.title || `技能工具 · ${skills.length}`,
        body: skills.map((skill) => `${skill}（${result.profile.skillEvidence[skill]?.[0]?.locator || "来源定位缺失"}）`).join("\n"),
        source: formatCollectionSourceLabel(sourceType),
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
        title: surface.title || `联系方式 · ${contacts.length}`,
        body: formatContactLines(contacts, result.profile.contactEvidence),
        source: formatCollectionSourceLabel(sourceType),
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
      title: surface.title || `${surface.kicker || "展示内容"} · ${surfaceItems.length}`,
      body: surfaceItems.length
        ? surfaceItems.map(formatItem).join("\n\n")
        : "原始资料中暂未识别到可展示内容。",
      source: formatCollectionSourceLabel(sourceType),
      sourceUrl,
    };
  }, [result, selectedId]);

  const selectedProjectItem = useMemo(() => {
    if (!result || !selectedDetail?.editableProject || !selectedDetail.sourceItemId) return undefined;
    return result.profile.items.find((item) => item.id === selectedDetail.sourceItemId && item.kind === "project");
  }, [result, selectedDetail]);

  const sourceBrowserProjectItem = useMemo(() => {
    if (!result || !sourceBrowserProjectId) return undefined;
    return result.profile.items.find((item) => item.id === sourceBrowserProjectId && item.kind === "project");
  }, [result, sourceBrowserProjectId]);

  const sourceBrowserLinks = useMemo(
    () => collectSourceLinks(result ? result.profile : null, sourceBrowserProjectItem || selectedProjectItem),
    [result, selectedProjectItem, sourceBrowserProjectItem],
  );

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
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => () => {
    if (sceneReadyTimer.current !== null) window.clearTimeout(sceneReadyTimer.current);
  }, []);

  useEffect(() => {
    function closeTransientUi(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelectedId("");
      setPrivateGateOpen(false);
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setAgentSetupOpen(false);
    }

    window.addEventListener("keydown", closeTransientUi);
    return () => window.removeEventListener("keydown", closeTransientUi);
  }, []);

  const handleSceneProgress = useCallback((progress: number) => {
    const bounded = Math.min(94, Math.max(0, Math.round(progress)));
    setSceneProgress((current) => Math.max(current, bounded));
  }, []);

  const handleSceneReady = useCallback(() => {
    setSceneProgress(100);
    if (sceneReadyTimer.current !== null) window.clearTimeout(sceneReadyTimer.current);
    sceneReadyTimer.current = window.setTimeout(() => {
      setSceneReady(true);
      sceneReadyTimer.current = null;
    }, 280);
  }, []);

  const handleSceneLoadState = useCallback((snapshot: SceneLoadingSnapshot) => {
    setSceneLoadState(snapshot);
  }, []);

  function resetPrivateAccess() {
    setPrivateGateOpen(false);
    setPrivateAccessMode("");
    setPrivatePassword("");
    setPrivatePasswordError("");
    setPrivateUnlocked(false);
    setPrivateUnlockedMode("");
  }

  function openWorld(profile: ParsedProfile) {
    const storedProjectEdits = readStoredProjectEdits(profile.id);
    const next = compileProfile(applyProjectEdits(profile, storedProjectEdits));
    beginSceneLoading();
    if (sceneReadyTimer.current !== null) window.clearTimeout(sceneReadyTimer.current);
    sceneReadyTimer.current = null;
    setSceneProgress(0);
    setSceneReady(false);
    setSceneLoadState(null);
    setResult(next);
    setProjectEdits(storedProjectEdits);
    setProjectEditDraft(EMPTY_PROJECT_EDIT);
    setProjectEditMessage("");
    setSelectedId("");
    setActiveRoom("room-lobby");
    setProjectPage(0);
    setSourceBrowserProjectId("");
    resetPrivateAccess();
    setMessage("");
  }

  async function parseTextWithAgent(
    text: string,
    label: string,
    type: "text" | "url" = "text",
    media: ExtractedMedia[] = [],
    sourceUrl?: string,
    followWebsite = true,
  ) {
    const response = await fetch("/api/parse", {
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
    const data = await response.json() as { profile?: ParsedProfile; error?: string; details?: string[] };
    if (!response.ok || !data.profile) {
      throw new Error([data.error, ...(data.details || [])].filter(Boolean).join(" · ") || "Agent 解析失败。");
    }
    openWorld(data.profile);
  }

  const requestRoomChange = useCallback((roomId: string) => {
    setSelectedId("");
    if (roomId === PRIVATE_ROOM_ID && !privateUnlocked) {
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setPrivateGateOpen(true);
      return;
    }
    setActiveRoom(roomId);
  }, [privateUnlocked]);

  function leavePrivateRoom(nextRoom: string) {
    setSelectedId("");
    setActiveRoom(nextRoom);
    if (activeRoom === PRIVATE_ROOM_ID) resetPrivateAccess();
  }

  function changeProjectPage(nextPage: number) {
    setSelectedId("");
    setProjectPage(Math.max(0, Math.min(projectPageCount - 1, nextPage)));
  }

  function unlockPrivateRoom(event: FormEvent<HTMLFormElement>) {
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
    setActiveRoom(PRIVATE_ROOM_ID);
  }

  async function extractUrl() {
    const value = url.trim();
    if (!value) return;
    if (!agentReady && agentConfigChecked) {
      setAgentSetupOpen(true);
      setMessage("请先配置 Profile Agent，再解析新的个人网页。");
      return;
    }
    setLoading(true);
    setMessage("正在读取网页…");
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await response.json()) as {
        text?: string;
        title?: string;
        media?: ExtractedMedia[];
        error?: string;
      };
      if (!response.ok || !data.text) throw new Error(data.error || "读取失败，请换一个公开网址。 ");
      setMessage("Claude Profile Agent 正在理解网页内容…");
      await parseTextWithAgent(data.text, data.title || value, "url", data.media || [], value, false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败，请稍后重试。 ");
    } finally {
      setLoading(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!agentReady && agentConfigChecked) {
      setAgentSetupOpen(true);
      setMessage("请先配置 Profile Agent，再上传新的简历。");
      return;
    }
    setLoading(true);
    setMessage("Claude Profile Agent 正在读取简历，并准备追踪个人网站…");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("followWebsite", "true");
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: browserAgentConfigHeaders(browserAgentConfig),
        body: form,
      });
      const data = await response.json() as { profile?: ParsedProfile; error?: string; details?: string[] };
      if (!response.ok || !data.profile) {
        throw new Error([data.error, ...(data.details || [])].filter(Boolean).join(" · ") || "Agent 解析失败。");
      }
      openWorld(data.profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取这个文件。");
    } finally {
      setLoading(false);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    void readFile(event.target.files?.[0]);
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  function openDemo() {
    openWorld(hanchenDemoProfile);
  }

  function saveBrowserAgentConfig(config: BrowserAgentConfig) {
    window.sessionStorage.setItem(BROWSER_AGENT_SESSION_KEY, JSON.stringify(config));
    setBrowserAgentConfig(config);
    setMessage("Agent 配置已保存到当前标签页，可以开始解析。");
    setAgentSetupOpen(false);
  }

  function clearBrowserAgentConfig() {
    window.sessionStorage.removeItem(BROWSER_AGENT_SESSION_KEY);
    setBrowserAgentConfig(null);
    setMessage(agentConfig?.ready ? "已恢复使用服务端 Agent 配置。" : "当前会话配置已清除。");
  }

  const selectWorldObject = useCallback((id: string) => {
    if (id === "bedroom-diary" && (activeRoom !== PRIVATE_ROOM_ID || !privateUnlocked)) {
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
    if (projectImageInput.current) projectImageInput.current.value = "";
    setSelectedId(id);
    setSourceBrowserProjectId(
      id === SOURCE_BROWSER_ID
        ? result?.profile.items.find((item) => item.kind === "project")?.id || ""
        : "",
    );
    setGuestbookError("");
    setDiaryError("");
  }, [activeRoom, privateUnlocked, result]);

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
    if (file.size > 1_000_000) {
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

  function saveDiaryEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!diaryWritable) {
      setDiaryError("参观模式只能浏览日记，不能保存新内容。");
      return;
    }
    const trimmedText = diaryText.trim();
    if (!trimmedText && !diaryImage) {
      setDiaryError("写一些文字，或选择一张图片再保存。");
      return;
    }
    const nextEntry: DiaryEntry = {
      id: createEntryId(),
      text: trimmedText.slice(0, 1200),
      imageDataUrl: diaryImage || undefined,
      createdAt: new Date().toISOString(),
    };
    const nextEntries = [...diaryEntries, nextEntry].slice(-8);
    try {
      writeStoredEntries(DIARY_STORAGE_KEY, nextEntries);
      setDiaryEntries(nextEntries);
      setDiaryText("");
      setDiaryImage("");
      setDiaryError("");
      if (diaryImageInput.current) diaryImageInput.current.value = "";
    } catch {
      setDiaryError("浏览器存储空间不足。删除图片或换一张更小的图片再试。");
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
    if (!projectEditDraft.title.trim() || !projectEditDraft.summary.trim()) {
      setProjectEditMessage("项目名称和项目说明都需要填写。 ");
      return;
    }
    if (projectEditDraft.projectUrl && !safeExternalHref(projectEditDraft.projectUrl)) {
      setProjectEditMessage("源文件链接需要是完整的 http:// 或 https:// 地址。 ");
      return;
    }
    const nextEdits = updateProjectEdit(projectEdits, selectedProjectItem.id, projectEditDraft);
    const nextProfile = applyProjectEdits(result.profile, nextEdits);
    setProjectEdits(nextEdits);
    setResult(compileProfile(nextProfile));
    try {
      writeStoredProjectEdits(result.profile.id, nextEdits);
      setProjectEditMessage("已保存到当前浏览器，3D 项目展岛已同步更新。");
    } catch {
      setProjectEditMessage("3D 项目展岛已更新；浏览器空间不足，本次图片只在当前会话保留。 ");
    }
  }

  if (!result) {
    return (
      <main className="intake-page">
        <header className="minimal-header">
          <Link className="wordmark" href="/" aria-label="ROOM home">ROOM</Link>
          <div className="header-tools">
            <button
              className={`agent-status-button ${agentReady ? "is-ready" : agentConfigChecked ? "is-missing" : "is-checking"}`}
              type="button"
              onClick={() => setAgentSetupOpen(true)}
            >
              <span aria-hidden="true" />
              {browserAgentConfig ? "当前会话已配置" : agentConfig?.ready ? "解析服务已就绪" : agentConfigChecked ? "配置解析服务" : "检测解析服务"}
            </button>
            <span className="edition">PRIVATE BETA · 01</span>
          </div>
        </header>

        <section className="intake-hero">
          <div className="hero-index" aria-hidden="true">R/01</div>
          <div className="hero-copy">
            <p className="overline">A portfolio you can walk into.</p>
            <h1>
              <span>把你的经历，</span>
              <span>变成你的世界。</span>
            </h1>
            <p className="intro">
              给我们你的个人网页或简历。ROOM 会把项目、经历和技能编排成一座可以走进去探索的 3D 博物馆。
            </p>
          </div>

          <div className="intake-form">
            <form
              className="url-form"
              onSubmit={(event) => {
                event.preventDefault();
                void extractUrl();
              }}
            >
              <label htmlFor="portfolio-url">个人网页</label>
              <div className="url-row">
                <input
                  id="portfolio-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://yourname.com"
                  autoComplete="url"
                />
                <button type="submit" disabled={loading || !url.trim()} aria-label="从网址生成博物馆">
                  <span>生成</span><span aria-hidden="true">→</span>
                </button>
              </div>
            </form>

            <div className="or"><span>或者</span></div>

            <button
              className={`upload-zone ${dragging ? "is-dragging" : ""}`}
              type="button"
              onClick={() => !agentReady && agentConfigChecked ? setAgentSetupOpen(true) : fileInput.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              disabled={loading}
            >
              <span className="upload-icon" aria-hidden="true">↑</span>
              <span className="upload-title">上传你的 CV</span>
              <span className="upload-note">拖到这里，或点击选择 · PDF / 图片 / 常见文本格式</span>
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".pdf,.txt,.md,.markdown,.html,.htm,.json,.csv,.tsv,.xml,.yaml,.yml,.rtf,.log,.jpg,.jpeg,.png,.gif,.webp,application/pdf,text/*,image/jpeg,image/png,image/gif,image/webp"
              onChange={upload}
            />

            <div className={`form-message ${message ? "is-visible" : ""}`} aria-live="polite">
              {loading ? <span className="loading-mark" aria-hidden="true" /> : null}
              {message}
            </div>
            <section className="demo-resumes" aria-labelledby="demo-resume-title">
              <div className="demo-heading">
                <span id="demo-resume-title">DEMO · 从简历到博物馆</span>
                <small>已完成 Agent 解析，可直接进入</small>
              </div>
              <div className="demo-panel demo-single">
                <div className="demo-person">
                  <span>韩</span>
                  <div><strong>韩晨</strong><small>中科院 · LLM-Agent / 多智能体系统</small></div>
                </div>
                <p>{hanchenDemoStats.projects} 个项目 · {hanchenDemoStats.journey} 段经历与教育 · {hanchenDemoStats.skills} 项技能 · {hanchenDemoStats.achievements} 项成就</p>
                <button type="button" disabled={loading} onClick={openDemo}>
                  进入韩晨的博物馆 <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          </div>
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
      <section className={`world-stage ${sceneReady ? "is-ready" : "is-loading"}`} aria-label={`${result.profile.name} 的 3D 个人世界`}>
        <div className="scene-loading-screen" aria-live="polite" aria-hidden={sceneReady}>
          <div className="scene-loading-brand">ROOM / BUILD</div>
          <div className="scene-loading-spinner" aria-hidden="true"><span /></div>
          <strong>{sceneProgress}%</strong>
          <div className="scene-loading-track" aria-hidden="true"><span style={{ width: `${sceneProgress}%` }} /></div>
          <p>
            {sceneLoadState?.errors
              ? "部分独立装饰未加载，基础房间仍可正常进入"
              : sceneProgress < 100
                ? "正在组装材质、灯光与个人展品"
                : "房间已准备好"}
          </p>
        </div>
        <button className="home-return" type="button" onClick={() => setResult(null)}>
          <span aria-hidden="true">←</span> 返回主页面
        </button>
        <WorldCanvas
          world={result.world}
          activeRoom={activeRoom}
          sceneReady={sceneReady}
          projectPage={projectPage}
          selectedExhibit={selectedId}
          guestbookMessages={guestbookEntries.map((entry) => entry.message)}
          onSelect={selectWorldObject}
          onRoomChange={requestRoomChange}
          onLoadProgress={handleSceneProgress}
          onLoadState={handleSceneLoadState}
          onReady={handleSceneReady}
        />

        <div className={`private-gate ${privateGateOpen ? "is-open" : ""}`} aria-hidden={!privateGateOpen}>
          {privateGateOpen ? (
            <section className="private-gate-card" role="dialog" aria-modal="true" aria-labelledby="private-gate-title">
              <p>PRIVATE AREA · 01</p>
              <h2 id="private-gate-title">进入二层私密展区</h2>
              <div className="private-gate-copy">进入前先选择身份。本人可以写入本机日记；参观者只能浏览已保存内容。文字和图片只保存在当前浏览器，不会上传。</div>
              <form onSubmit={unlockPrivateRoom}>
                <fieldset className="private-mode-picker" aria-label="选择私密展区访问身份">
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
                  <button type="submit" disabled={!privateAccessMode}>以{privateAccessMode ? BEDROOM_ACCESS_COPY[privateAccessMode].label : "所选身份"}进入</button>
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
              <button
                type="button"
                onClick={() => {
                  leavePrivateRoom(activeRoom === "room-lobby" ? "exterior" : "room-lobby");
                }}
              >
                ← {activeRoom === "room-lobby" ? "回到展馆外" : "返回主展厅"}
              </button>
              {activeRoom === "room-lobby" ? (
                <>
                  <button type="button" onClick={() => requestRoomChange(PRIVATE_ROOM_ID)}>
                    二层私密展区 · 选择身份
                  </button>
                  {projectPageCount > 1 ? (
                    <>
                      <button type="button" onClick={() => changeProjectPage(projectPage - 1)} disabled={projectPage === 0}>
                        ← 上一组项目
                      </button>
                      <span>{projectPage + 1} / {projectPageCount} · 共 {projectCount} 个项目</span>
                      <button type="button" onClick={() => changeProjectPage(projectPage + 1)} disabled={projectPage >= projectPageCount - 1}>
                        下一组项目 →
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </nav>

        <div className={`exhibit-detail ${selectedDetail ? "is-open" : ""}`}>
          {selectedDetail ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭详情">×</button>
              <p>{selectedDetail.eyebrow}</p>
              <h2>{selectedDetail.title}</h2>
              <DetailBody body={selectedDetail.body} />
              {selectedDetail.editableProject && selectedProjectItem ? (
                <form className="project-editor" onSubmit={saveProjectEdit}>
                  <div className="project-editor-heading">
                    <strong>EDIT THIS EXHIBIT</strong>
                    <span>本地覆盖 · 保留原始证据</span>
                  </div>
                  <label htmlFor="project-edit-title">项目名称</label>
                  <input
                    id="project-edit-title"
                    value={projectEditDraft.title}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, title: event.target.value }))}
                    maxLength={120}
                  />
                  <label htmlFor="project-edit-summary">项目说明</label>
                  <textarea
                    id="project-edit-summary"
                    value={projectEditDraft.summary}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, summary: event.target.value }))}
                    maxLength={900}
                    rows={5}
                  />
                  <label htmlFor="project-edit-source">源文件 / 项目链接</label>
                  <input
                    id="project-edit-source"
                    type="url"
                    value={projectEditDraft.projectUrl || ""}
                    onChange={(event) => setProjectEditDraft((current) => ({ ...current, projectUrl: event.target.value }))}
                    placeholder="https://github.com/you/project"
                  />
                  <div className="project-cover-upload">
                    <label htmlFor="project-edit-image">项目展岛封面</label>
                    <input ref={projectImageInput} id="project-edit-image" type="file" accept="image/*" onChange={(event) => void readProjectImage(event)} />
                    <span>自动缩放为适合 3D 屏幕的尺寸</span>
                  </div>
                  {projectEditDraft.imageUrl ? (
                    <Image className="project-cover-preview" src={projectEditDraft.imageUrl} alt="项目展岛封面预览" width={320} height={190} unoptimized />
                  ) : null}
                  <div className="project-edit-message" aria-live="polite">{projectEditMessage}</div>
                  <button type="submit">保存并更新项目展岛</button>
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
                      <dd>
                        {item.value}
                        {item.evidence ? <small>证据定位：{item.evidence}</small> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <small>
                {selectedDetail.source}
                {selectedDetail.sourceUrl ? (
                  <> · <a href={selectedDetail.sourceUrl} target="_blank" rel="noreferrer">在来源终端打开源文件 ↗</a></>
                ) : null}
              </small>
            </>
          ) : null}
        </div>

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
                <textarea id="guest-message" value={guestMessage} onChange={(event) => { setGuestMessage(event.target.value); setGuestbookError(""); }} placeholder="这座展馆让你想到什么？" maxLength={160} rows={4} />
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
                  <textarea id="diary-text" value={diaryText} onChange={(event) => { setDiaryText(event.target.value); setDiaryError(""); }} placeholder="写下一段只属于自己的记录……" maxLength={1200} rows={5} />
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
                : "WASD 第一人称移动 · 点击项目展岛查看或编辑详情 · 点击楼梯上二楼"
              : selectedId === "bedroom-diary"
                ? diaryWritable
                  ? "本人日记已打开 · 可写入本机浏览器"
                  : "参观日记已打开 · 只读浏览"
                : "WASD 第一人称移动 · 点击桌上的日记本 · 返回主展厅继续浏览"}
        </div>
      </section>
    </main>
  );
}
