"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { runPipeline } from "@/lib/agents/pipeline";
import { sampleResume } from "@/lib/data/sample-resume";
import type { PipelineResult } from "@/lib/types";

const WorldCanvas = dynamic(
  () => import("./WorldCanvas").then((module) => module.WorldCanvas),
  { ssr: false },
);

export function RoomStudio() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeRoom, setActiveRoom] = useState("overview");
  const [selectedId, setSelectedId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = useMemo(
    () => result?.world.exhibits.find((item) => item.id === selectedId),
    [result, selectedId],
  );

  function openWorld(text: string, label: string, type: "text" | "url" = "text") {
    const next = runPipeline(text, { label, type, id: type === "url" ? label : undefined });
    setResult(next);
    setSelectedId("");
    setActiveRoom("overview");
    setMessage("");
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
        error?: string;
      };
      if (!response.ok || !data.text) throw new Error(data.error || "读取失败，请换一个公开网址。 ");
      openWorld(data.text, data.title || value, "url");
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
              给我们你的个人网页或简历。ROOM 会把项目、经历和技能编排成一座可以探索的 3D 房间。
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
                <button type="submit" disabled={loading || !url.trim()} aria-label="从网址生成房间">
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
            <button className="demo-result-button" type="button" onClick={() => openWorld(sampleResume, "ROOM Demo 简历")}>没有简历？直接查看生成结果 <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <footer className="minimal-footer">
          <span>One source in.</span>
          <span>One world out.</span>
          <span>25 exhibits · 5 rooms</span>
        </footer>
      </main>
    );
  }

  const mappedCount = result.report.checks.find((check) => check.name === "Content parity")?.detail;

  return (
    <main className="world-page">
      <header className="world-header">
        <button className="wordmark wordmark-button" type="button" onClick={() => setResult(null)}>ROOM</button>
        <div className="world-identity">
          <strong>{result.profile.name}</strong>
          <span>{result.profile.headline}</span>
        </div>
        <button className="start-over" type="button" onClick={() => setResult(null)}>重新上传</button>
      </header>

      <section className="world-stage" aria-label={`${result.profile.name} 的 3D 个人世界`}>
        <WorldCanvas
          world={result.world}
          activeRoom={activeRoom}
          selectedExhibit={selectedId}
          onSelect={setSelectedId}
        />

        <div className="world-status">
          <span className="status-dot" />
          {result.report.passed ? `已检查 · ${mappedCount}` : "需要调整"}
        </div>

        <nav className="room-nav" aria-label="房间导航">
          <button type="button" className={activeRoom === "overview" ? "active" : ""} onClick={() => setActiveRoom("overview")}>全屋</button>
          {result.world.rooms.map((room) => (
            <button
              type="button"
              className={activeRoom === room.id ? "active" : ""}
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
            >
              {room.title}
            </button>
          ))}
        </nav>

        <div className={`exhibit-detail ${selected ? "is-open" : ""}`}>
          {selected ? (
            <>
              <button className="detail-close" type="button" onClick={() => setSelectedId("")} aria-label="关闭详情">×</button>
              <p>{selected.eyebrow}</p>
              <h2>{selected.title}</h2>
              <div className="detail-text">{selected.body}</div>
              <small>{selected.evidence[0]?.locator} · 来自原始简历</small>
            </>
          ) : null}
        </div>

        <div className="world-hint">点击展品查看内容</div>
      </section>
    </main>
  );
}
