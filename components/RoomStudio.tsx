"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useEffect,
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

const CAMERA_JOURNEY = [
  { label: "全景", title: "The Great Drawing Room", note: "从空间全貌开始，建立第一眼的尺度与气氛。" },
  { label: "织毯", title: "A room that remembers", note: "靠近墙面，让巨幅织物成为空间的记忆层。" },
  { label: "藏品柜", title: "Collected details", note: "转向陈列与装饰，让器物和生活痕迹成为叙事。" },
  { label: "穹顶", title: "Look above", note: "抬头看天花与金色线脚，感受建筑包裹视线。" },
  { label: "会客区", title: "Inside the salon", note: "降低视点，像真正站在家具之间结束这段参观。" },
];

export function RoomStudio() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeShot, setActiveShot] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  function openWorld(text: string, label: string, type: "text" | "url" = "text") {
    const next = runPipeline(text, { label, type, id: type === "url" ? label : undefined });
    setResult(next);
    setActiveShot(0);
    setMessage("");
  }

  useEffect(() => {
    if (!result) return;
    function navigateCamera(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setActiveShot((current) => {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        return (current + direction + CAMERA_JOURNEY.length) % CAMERA_JOURNEY.length;
      });
    }
    window.addEventListener("keydown", navigateCamera);
    return () => window.removeEventListener("keydown", navigateCamera);
  }, [result]);

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
                <span id="demo-resume-title">FEATURED DEMO · 从简历到别墅</span>
                <small>第一版唯一样例</small>
              </div>
              <div className="demo-panel demo-single">
                <div className="demo-person">
                  <span>林</span>
                  <div><strong>林澈</strong><small>Creative Technologist / AI Experience Designer</small></div>
                </div>
                <p>4 个项目 · 5 段经历与教育 · 12 项技能 · 3 项成就</p>
                <button type="button" onClick={() => openWorld(sampleResume, "林澈 Demo 简历")}>
                  进入林澈的别墅 <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          </div>
        </section>

        <footer className="minimal-footer">
          <span>One source in.</span>
          <span>One world out.</span>
          <span>1 resume · 1 villa · 5 rooms</span>
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
        <WorldCanvas activeShot={activeShot} />

        <div className="shot-vignette" aria-hidden="true" />

        <div className="world-status">
          <span className="status-dot" />
          {result.report.passed ? `原始模型预览已就绪 · ${mappedCount}` : "需要调整"}
        </div>

        <nav className="journey-nav" aria-label="空间导航">
          <button
            type="button"
            onClick={() => setActiveShot((activeShot - 1 + CAMERA_JOURNEY.length) % CAMERA_JOURNEY.length)}
            aria-label="上一个镜头"
          >
            ←
          </button>
          <span>{String(activeShot + 1).padStart(2, "0")} / {String(CAMERA_JOURNEY.length).padStart(2, "0")}</span>
          {CAMERA_JOURNEY.map((shot, index) => (
            <button
              key={shot.label}
              type="button"
              className={index === activeShot ? "is-active" : ""}
              onClick={() => setActiveShot(index)}
              aria-current={index === activeShot ? "step" : undefined}
            >
              {shot.label}
            </button>
          ))}
          <button
            type="button"
            className="journey-next"
            onClick={() => setActiveShot((activeShot + 1) % CAMERA_JOURNEY.length)}
            aria-label="下一个镜头"
          >
            NEXT&nbsp; →
          </button>
        </nav>

        <div className="world-hint" aria-live="polite">
          <span>SCENE {String(activeShot + 1).padStart(2, "0")}</span>
          <strong>{CAMERA_JOURNEY[activeShot].title}</strong>
          <p>{CAMERA_JOURNEY[activeShot].note}</p>
          <small>移动鼠标感受视差 · ← → 切换镜头</small>
        </div>

        <div className="model-credit">
          3D model: <a href="https://sketchfab.com/3d-models/the-great-drawing-room-feb9ad17e042418c8e759b81e3b2e5d7" target="_blank" rel="noreferrer">The Great Drawing Room</a>
          {" · "}The Hallwyl Museum{" · "}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
        </div>
      </section>
    </main>
  );
}
