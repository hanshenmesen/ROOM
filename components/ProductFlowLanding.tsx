"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

const ASSET_ROOT = "/assets/blueprint/parts";

const AGENT_STEPS = [
  { name: "Parser", detail: "抽事实 + 证据", icon: "agent-parser.png", tone: "parser", width: 159, height: 150 },
  { name: "Director", detail: "定主题 + 检索", icon: "agent-director.png", tone: "director", width: 163, height: 165 },
  { name: "Orchestrator", detail: "内容 → 房间 & 展品", icon: "agent-orchestrator.png", tone: "orchestrator", width: 181, height: 145 },
  { name: "Checker", detail: "发布前确定性 QA", icon: "agent-checker.png", tone: "checker", width: 164, height: 171 },
] as const;

export function ProductFlowLanding({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  function enterIntake() {
    if (leaving) return;
    setLeaving(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onEnter, reducedMotion ? 0 : 520);
  }

  return (
    <main className={`flow-landing ${leaving ? "is-leaving" : ""}`}>
      <header className="flow-header">
        <img className="flow-logo" src={`${ASSET_ROOT}/room-logo.webp`} alt="ROOM" width={438} height={160} fetchPriority="high" decoding="async" />
        <h1 id="flow-title">把你的经历，变成你的世界。</h1>
      </header>

      <section className="flow-layout" aria-labelledby="flow-title">
        <article className="flow-step flow-step-source">
          <header className="flow-step-heading">
            <span>01</span>
            <div><small>INPUT</small><h2>一份真实经历</h2></div>
          </header>

          <div className="flow-source-visual">
            <figure className="flow-owner">
              <img src={`${ASSET_ROOT}/owner.png`} alt="房主像素人物" width={137} height={253} decoding="async" />
              <figcaption>Owner</figcaption>
            </figure>

            <div className="flow-documents" aria-label="支持 PDF 简历或个人网页">
              <div className="flow-pdf-card" aria-label="PDF 简历">
                <img src={`${ASSET_ROOT}/resume-paper.png`} alt="" width={196} height={247} decoding="async" />
                <strong>PDF</strong>
                <span className="flow-paper-lines" aria-hidden="true"><i /><i /><i /><i /></span>
              </div>
              <img className="flow-web-card" src={`${ASSET_ROOT}/web-profile.webp`} alt="个人网页资料" width={693} height={1093} decoding="async" />
            </div>
          </div>
        </article>

        <div className="flow-bridge flow-bridge-input" aria-hidden="true"><span /><i>→</i></div>

        <article className="flow-step flow-step-agents">
          <header className="flow-step-heading">
            <span>02</span>
            <div><small>PROCESS</small><h2>Agent 理解与编排</h2></div>
          </header>

          <div className="flow-agent-visual">
            <div className="flow-agent-stack">
              {AGENT_STEPS.map((agent, index) => (
                <div className={`flow-agent flow-agent-${agent.tone}`} style={{ "--agent-index": index } as React.CSSProperties} key={agent.name}>
                  <div><strong>{agent.name}</strong><span>{agent.detail}</span></div>
                  <img src={`${ASSET_ROOT}/${agent.icon}`} alt="" width={agent.width} height={agent.height} decoding="async" />
                </div>
              ))}
            </div>

            <div className="flow-world-file">
              <img src={`${ASSET_ROOT}/world-bolt.png`} alt="" width={86} height={132} decoding="async" />
              <div><strong>world.json</strong><code>{"{  {...}  }"}</code></div>
            </div>
          </div>
        </article>

        <div className="flow-bridge flow-bridge-output" aria-hidden="true"><span /><i>→</i></div>

        <article className="flow-step flow-step-result">
          <header className="flow-step-heading">
            <span>03</span>
            <div><small>WORLD</small><h2>长成一个人的世界</h2></div>
          </header>

          <div className="flow-house-visual">
            <span className="flow-house-light" aria-hidden="true" />
            <img className="flow-house" src={`${ASSET_ROOT}/house.webp`} alt="由简历内容生成的六个主题空间" width={1196} height={877} decoding="async" />
            <span className="flow-room-lights" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => <i style={{ "--room-index": index } as React.CSSProperties} key={index} />)}
            </span>

            <div className="flow-visitor">
              <img className="flow-visitor-avatar" src={`${ASSET_ROOT}/visitor.png`} alt="访客像素人物" width={131} height={229} decoding="async" />
              <div className="flow-comment">
                <img src={`${ASSET_ROOT}/comment-bubble.png`} alt="" width={133} height={125} decoding="async" />
                <p><strong>留个空间评论～</strong><span>绑定展品 · 换布局不丢</span></p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <button className="flow-enter" type="button" onClick={enterIntake} disabled={leaving}>
        <span>开始创建</span><span aria-hidden="true">→</span>
      </button>
    </main>
  );
}
