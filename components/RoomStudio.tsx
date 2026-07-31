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
import { runPipeline } from "@/lib/agents/pipeline";
import { parseProfile } from "@/lib/agents/parser";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import { sampleResume } from "@/lib/data/sample-resume";
import type { ContentFamily, PipelineResult, ProfileItem, SourceEvidence } from "@/lib/types";
import {
  beginSceneLoading,
  type SceneLoadingSnapshot,
} from "./SceneLoadingStore";

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
const sampleResumeProfile = parseProfile(sampleResume);
const sampleResumeStats = {
  projects: sampleResumeProfile.items.filter((item) => item.kind === "project").length,
  journey: sampleResumeProfile.items.filter((item) => item.kind === "experience" || item.kind === "education").length,
  skills: sampleResumeProfile.skills.length,
  achievements: sampleResumeProfile.items.filter((item) => item.kind === "achievement").length,
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
  metadata?: {
    label: string;
    value: string;
    evidence?: string;
  }[];
  source: string;
  sourceUrl?: string;
};

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

export function RoomStudio() {
  const [result, setResult] = useState<PipelineResult | null>(null);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const diaryImageInput = useRef<HTMLInputElement>(null);
  const sceneReadyTimer = useRef<number | null>(null);
  const projectCount = result?.world.exhibits.filter((item) => item.eyebrow === "PROJECT").length || 0;
  const projectPageCount = Math.max(1, Math.ceil(projectCount / PROJECTS_PER_PAGE));
  const diaryWritable = canEditPrivateDiary(privateUnlockedMode);
  const selectedDetail = useMemo<SelectedDetail | undefined>(() => {
    if (!result || !selectedId || selectedId === "showroom-guestbook" || selectedId === "bedroom-diary") return undefined;
    const sourceType = result.profile.source.type;
    const resolvedSelectedId = selectedId.startsWith("project-wall:")
      ? selectedId.slice("project-wall:".length)
      : selectedId;
    const exhibit = result.world.exhibits.find((item) => item.id === resolvedSelectedId);
    if (exhibit) {
      return {
        eyebrow: exhibit.eyebrow,
        title: exhibit.title,
        body: exhibit.body,
        metadata: projectMetadataForDetail(exhibit),
        source: formatSourceLabel(sourceType, exhibit.evidence[0]),
        sourceUrl: safeExternalHref(exhibit.projectUrl) || safeExternalHref(exhibit.sourceUrl),
      };
    }
    const surface = result.world.displaySurfaces.find((item) => item.id === selectedId);
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

  function openWorld(text: string, label: string, type: "text" | "url" = "text", media: ExtractedMedia[] = [], sourceUrl?: string) {
    const next = runPipeline(text, { label, type, id: type === "url" ? sourceUrl || label : undefined, media });
    beginSceneLoading();
    if (sceneReadyTimer.current !== null) window.clearTimeout(sceneReadyTimer.current);
    sceneReadyTimer.current = null;
    setSceneProgress(0);
    setSceneReady(false);
    setSceneLoadState(null);
    setResult(next);
    setSelectedId("");
    setActiveRoom("room-lobby");
    setProjectPage(0);
    resetPrivateAccess();
    setMessage("");
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
      openWorld(data.text, data.title || value, "url", data.media || [], value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败，请稍后重试。 ");
    } finally {
      setLoading(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["txt", "md", "html", "htm"].includes(extension)) {
      setMessage("当前 Demo 支持 TXT、Markdown 和 HTML 简历。PDF 解析会在下一版加入。");
      return;
    }
    setLoading(true);
    setMessage("正在读取简历…");
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("这个文件没有可读取的文字。");
      openWorld(text, file.name);
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

  const selectWorldObject = useCallback((id: string) => {
    if (id === "bedroom-diary" && (activeRoom !== PRIVATE_ROOM_ID || !privateUnlocked)) {
      setPrivateAccessMode("");
      setPrivatePassword("");
      setPrivatePasswordError("");
      setPrivateGateOpen(true);
      return;
    }
    setSelectedId(id);
    setGuestbookError("");
    setDiaryError("");
  }, [activeRoom, privateUnlocked]);

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

  if (!result) {
    return (
      <main className="intake-page">
        <header className="minimal-header">
          <Link className="wordmark" href="/" aria-label="ROOM home">ROOM</Link>
          <span className="edition">PRIVATE BETA · 01</span>
        </header>

        <section className="intake-hero">
          <div className="hero-index" aria-hidden="true">R/01</div>
          <div className="hero-copy">
            <p className="overline">A portfolio you can walk into.</p>
            <h1>把你的经历，<br />变成一个世界。</h1>
            <p className="intro">
              给我们你的个人网页或简历。ROOM 会把项目、经历和技能编排成一栋可以走进去探索的 3D 小别墅。
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
                <button type="submit" disabled={loading || !url.trim()} aria-label="从网址生成别墅">
                  <span>生成</span><span aria-hidden="true">→</span>
                </button>
              </div>
            </form>

            <div className="or"><span>或者</span></div>

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
              <span className="upload-icon" aria-hidden="true">↑</span>
              <span className="upload-title">上传你的 CV</span>
              <span className="upload-note">拖到这里，或点击选择 · TXT / MD / HTML</span>
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html"
              onChange={upload}
            />

            <div className={`form-message ${message ? "is-visible" : ""}`} aria-live="polite">
              {loading ? <span className="loading-mark" aria-hidden="true" /> : null}
              {message}
            </div>
            <section className="demo-resumes" aria-labelledby="demo-resume-title">
              <div className="demo-heading">
                <span id="demo-resume-title">DEMO · 从简历到别墅</span>
                <small>示例数据，仅用于快速体验</small>
              </div>
              <div className="demo-panel demo-single">
                <div className="demo-person">
                  <span>示</span>
                  <div><strong>示例人物</strong><small>自动解析样例 · 不代表真实个人</small></div>
                </div>
                <p>{sampleResumeStats.projects} 个项目 · {sampleResumeStats.journey} 段经历与教育 · {sampleResumeStats.skills} 项技能 · {sampleResumeStats.achievements} 项成就</p>
                <button type="button" onClick={() => openWorld(sampleResume, "示例 Demo 简历")}>
                  进入示例别墅 <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          </div>
        </section>

        <footer className="minimal-footer">
          <span>One source in.</span>
          <span>One world out.</span>
          <span>1 resume · 1 public showroom · 1 private bedroom</span>
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
                  <> · <a href={selectedDetail.sourceUrl} target="_blank" rel="noreferrer">打开原始来源</a></>
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
                : "移动鼠标环视 · 点击资料物件、圆形项目展岛或访客签到台"
              : selectedId === "bedroom-diary"
                ? diaryWritable
                  ? "本人日记已打开 · 可写入本机浏览器"
                  : "参观日记已打开 · 只读浏览"
                : "移动鼠标环视 · 点击桌上的日记本 · 返回主展厅继续浏览"}
        </div>
      </section>
    </main>
  );
}
