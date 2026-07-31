"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { runPipeline } from "@/lib/agents/pipeline";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import { sampleResume } from "@/lib/data/sample-resume";
import type { PipelineResult } from "@/lib/types";

const WorldCanvas = dynamic(
  () => import("./WorldCanvas").then((module) => module.WorldCanvas),
  { ssr: false },
);

const PRIVATE_ROOM_ID = "room-private";
const DEMO_PRIVATE_PASSWORD = "room2026";
const GUESTBOOK_STORAGE_KEY = "room:guestbook:v1";
const DIARY_STORAGE_KEY = "room:diary:v1";

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

type SelectedDetail = {
  eyebrow: string;
  title: string;
  body: string;
  source: string;
};

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

export function RoomStudio() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeRoom, setActiveRoom] = useState("room-lobby");
  const [selectedId, setSelectedId] = useState("");
  const [privateGateOpen, setPrivateGateOpen] = useState(false);
  const [privatePassword, setPrivatePassword] = useState("");
  const [privatePasswordError, setPrivatePasswordError] = useState("");
  const [privateUnlocked, setPrivateUnlocked] = useState(false);
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
  const selectedDetail = useMemo<SelectedDetail | undefined>(() => {
    if (!result || !selectedId || selectedId === "showroom-guestbook" || selectedId === "bedroom-diary") return undefined;
    const resolvedSelectedId = selectedId.startsWith("project-wall:")
      ? selectedId.slice("project-wall:".length)
      : selectedId;
    const exhibit = result.world.exhibits.find((item) => item.id === resolvedSelectedId);
    if (exhibit) {
      return {
        eyebrow: exhibit.eyebrow,
        title: exhibit.title,
        body: exhibit.body,
        source: `${exhibit.evidence[0]?.locator || "原始简历"} · 来自原始简历`,
      };
    }
    const journey = result.profile.items.filter((item) => item.kind === "experience" || item.kind === "education");
    const achievements = result.profile.items.filter((item) => item.kind === "achievement");
    const authoredDetails: Record<string, SelectedDetail> = {
      "showroom-profile": {
        eyebrow: "PROFILE 01",
        title: result.profile.name,
        body: `${result.profile.headline}\n\n${result.profile.summary}`,
        source: "简介 · 来自原始简历",
      },
      "showroom-journey": {
        eyebrow: "JOURNEY 02",
        title: "经历与教育",
        body: journey.map((item) => `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}\n${item.summary}`).join("\n\n"),
        source: "经历 / 教育 · 来自原始简历",
      },
      "showroom-skills": {
        eyebrow: "TOOLBOX 03",
        title: `${result.profile.skills.length} 项能力`,
        body: result.profile.skills.join(" · "),
        source: "技能 · 来自原始简历",
      },
      "showroom-contact": {
        eyebrow: "CONTACT 04",
        title: "保持联系",
        body: result.profile.contacts.join("\n"),
        source: "联系 · 来自原始简历",
      },
      "showroom-highlights": {
        eyebrow: "HIGHLIGHTS 05",
        title: "成就与影响",
        body: achievements.map((item) => `${item.title}${item.summary ? `\n${item.summary}` : ""}`).join("\n\n"),
        source: "成就 · 来自原始简历",
      },
    };
    return authoredDetails[selectedId];
  }, [result, selectedId]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setGuestbookEntries(readStoredEntries<GuestbookEntry>(GUESTBOOK_STORAGE_KEY));
      setDiaryEntries(readStoredEntries<DiaryEntry>(DIARY_STORAGE_KEY));
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  function openWorld(text: string, label: string, type: "text" | "url" = "text", media: ExtractedMedia[] = []) {
    const next = runPipeline(text, { label, type, id: type === "url" ? label : undefined, media });
    setResult(next);
    setSelectedId("");
    setActiveRoom("room-lobby");
    setPrivateGateOpen(false);
    setPrivatePassword("");
    setPrivatePasswordError("");
    setPrivateUnlocked(false);
    setMessage("");
  }

  function requestRoomChange(roomId: string) {
    setSelectedId("");
    if (roomId === PRIVATE_ROOM_ID && !privateUnlocked) {
      setPrivatePassword("");
      setPrivatePasswordError("");
      setPrivateGateOpen(true);
      return;
    }
    setActiveRoom(roomId);
  }

  function unlockPrivateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (privatePassword !== DEMO_PRIVATE_PASSWORD) {
      setPrivatePasswordError("密码不正确，请使用当前 Demo 密码。");
      return;
    }
    setPrivateUnlocked(true);
    setPrivateGateOpen(false);
    setPrivatePasswordError("");
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
      openWorld(data.text, data.title || value, "url", data.media || []);
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

  function selectWorldObject(id: string) {
    setSelectedId(id);
    setGuestbookError("");
    setDiaryError("");
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
                <span id="demo-resume-title">FEATURED DEMO · 从简历到博物馆</span>
                <small>第一版唯一样例</small>
              </div>
              <div className="demo-panel demo-single">
                <div className="demo-person">
                  <span>林</span>
                  <div><strong>林澈</strong><small>Creative Technologist / AI Experience Designer</small></div>
                </div>
                <p>4 个项目 · 5 段经历与教育 · 12 项技能 · 3 项成就</p>
                <button type="button" onClick={() => openWorld(sampleResume, "林澈 Demo 简历")}>
                  进入林澈的博物馆 <span aria-hidden="true">→</span>
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
      <section className="world-stage" aria-label={`${result.profile.name} 的 3D 个人世界`} data-active-room={activeRoom} data-selected-exhibit={selectedId || undefined}>
        <button className="home-return" type="button" onClick={() => setResult(null)}>
          <span aria-hidden="true">←</span> 返回主页面
        </button>
        <WorldCanvas
          world={result.world}
          activeRoom={activeRoom}
          selectedExhibit={selectedId}
          guestbookMessages={guestbookEntries.map((entry) => entry.message)}
          onSelect={selectWorldObject}
          onRoomChange={requestRoomChange}
        />

        <div className={`private-gate ${privateGateOpen ? "is-open" : ""}`} aria-hidden={!privateGateOpen}>
          {privateGateOpen ? (
            <section className="private-gate-card" role="dialog" aria-modal="true" aria-labelledby="private-gate-title">
              <p>PRIVATE AREA · 2F</p>
              <h2 id="private-gate-title">进入二楼私人房间</h2>
              <div className="private-gate-copy">你现在位于二楼入口外。输入密码后，镜头会平滑穿过门厅，进入只在本机保存内容的私人日记室。</div>
              <form onSubmit={unlockPrivateRoom}>
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
                  aria-describedby="private-password-hint private-password-error"
                />
                <small id="private-password-hint">当前 Demo 密码：{DEMO_PRIVATE_PASSWORD}</small>
                <div id="private-password-error" className="private-gate-error" aria-live="polite">{privatePasswordError}</div>
                <div className="private-gate-actions">
                  <button type="button" onClick={() => setPrivateGateOpen(false)}>留在入口</button>
                  <button type="submit">解锁并进入</button>
                </div>
              </form>
            </section>
          ) : null}
        </div>

        {activeRoom === "room-lobby" ? <aside className="exhibit-directory" aria-label="展品目录">
          <strong>一楼展品目录</strong>
          <div>
            {[
              ["showroom-profile", "简介"],
              ["showroom-journey", "经历"],
              ["showroom-skills", "技能"],
              ["showroom-highlights", "成就"],
              ["showroom-contact", "联系"],
              ["showroom-guestbook", "留言"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={selectedId === id ? "is-active" : ""} onClick={() => selectWorldObject(id)}>{label}</button>
            ))}
            {result.world.exhibits.filter((item) => item.eyebrow === "PROJECT").slice(0, 4).map((item, index) => (
              <button key={item.id} type="button" className={selectedId === item.id ? "is-active" : ""} onClick={() => selectWorldObject(item.id)}>项目 {index + 1}</button>
            ))}
          </div>
        </aside> : null}

        <nav className="journey-nav" aria-label="楼层与房间导航">
          {activeRoom === "room-lobby" ? (
            <button type="button" onClick={() => requestRoomChange("room-private-entry")}>前往二楼私人区 ↑</button>
          ) : activeRoom === "room-private-entry" ? (
            <>
              <button type="button" onClick={() => requestRoomChange("room-lobby")}>↓ 返回一楼公共展厅</button>
              <button type="button" onClick={() => requestRoomChange(PRIVATE_ROOM_ID)}>私人房间 · {privateUnlocked ? "进入" : "输入密码"}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => requestRoomChange("room-private-entry")}>← 返回二楼入口</button>
              <button type="button" onClick={() => requestRoomChange("room-lobby")}>↓ 返回一楼公共展厅</button>
            </>
          )}
        </nav>

        <div className={`exhibit-detail ${selectedDetail ? "is-open" : ""}`}>
          {selectedDetail ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭详情">×</button>
              <p>{selectedDetail.eyebrow}</p>
              <h2>{selectedDetail.title}</h2>
              <div className="detail-text">{selectedDetail.body}</div>
              <small>{selectedDetail.source}</small>
            </>
          ) : null}
        </div>

        <aside className={`memory-panel ${selectedId === "showroom-guestbook" ? "is-open" : ""}`} aria-hidden={selectedId !== "showroom-guestbook"}>
          {selectedId === "showroom-guestbook" ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭访客留言板">×</button>
              <p>VISITOR CORNER</p>
              <h2>在客厅留句话</h2>
              <div className="memory-description">留言会保存在这台浏览器中，并立即出现在 3D 留言板上。</div>
              <form className="memory-form" onSubmit={saveGuestbookEntry}>
                <label htmlFor="guest-name">名字</label>
                <input id="guest-name" value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="匿名访客" maxLength={32} />
                <label htmlFor="guest-message">留言</label>
                <textarea id="guest-message" value={guestMessage} onChange={(event) => { setGuestMessage(event.target.value); setGuestbookError(""); }} placeholder="这间客厅让你想到什么？" maxLength={160} rows={4} />
                <div className="memory-error" aria-live="polite">{guestbookError}</div>
                <button type="submit">保存到留言板</button>
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
              <h2>今天想留下什么？</h2>
              <div className="memory-description">文字和图片只保存在当前浏览器，不会上传到服务器。</div>
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

        <div className="world-hint">
          {activeRoom === "room-lobby"
            ? selectedId
              ? "镜头已平滑聚焦 · 关闭面板返回探索视角"
              : "W / A / S / D 移动 · 移动鼠标环视 · 点击展品查看内容"
            : activeRoom === "room-private-entry"
              ? "二楼入口 · 点击紫色门或使用下方按钮验证密码"
              : selectedId === "bedroom-diary"
                ? "私人日记已打开 · 内容只保存在当前浏览器"
                : "W / A / S / D 移动 · 点击桌上的书本打开私人日记"}
        </div>
      </section>
    </main>
  );
}
