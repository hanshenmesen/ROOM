"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

const ASSET_ROOT = "/assets/blueprint/parts";

const AGENT_STEPS = [
  { name: "Parser", detail: "抽事实 + 证据", icon: "agent-parser.png", tone: "parser" },
  { name: "Director", detail: "定主题 + 检索", icon: "agent-director.png", tone: "director" },
  { name: "Orchestrator", detail: "内容 → 房间 & 展品", icon: "agent-orchestrator.png", tone: "orchestrator" },
  { name: "Checker", detail: "发布前确定性 QA", icon: "agent-checker.png", tone: "checker" },
] as const;

export function ProductFlowLanding({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  function enterIntake() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onEnter, 520);
  }

  return (
    <main className={`flow-landing ${leaving ? "is-leaving" : ""}`}>
      <header className="flow-header">
        <img className="flow-logo" src={`${ASSET_ROOT}/room-logo.png`} alt="ROOM" />
        <h1 id="flow-title">你的简历 <span aria-hidden="true">→</span> 你的房子</h1>
      </header>

      <section className="flow-layout" aria-labelledby="flow-title">
        <article className="flow-step flow-step-source">
          <header className="flow-step-heading">
            <span>01</span>
            <div><small>INPUT</small><h2>投入一份简历</h2></div>
          </header>

          <div className="flow-source-visual">
            <figure className="flow-owner">
              <img src={`${ASSET_ROOT}/owner.png`} alt="房主像素人物" />
              <figcaption>Owner</figcaption>
            </figure>

            <div className="flow-documents" aria-label="支持 PDF 简历或个人网页">
              <div className="flow-pdf-card" aria-label="PDF 简历">
                <img src={`${ASSET_ROOT}/resume-paper.png`} alt="" />
                <strong>PDF</strong>
                <span className="flow-paper-lines" aria-hidden="true"><i /><i /><i /><i /></span>
              </div>
              <img className="flow-web-card" src={`${ASSET_ROOT}/web-profile.png`} alt="个人网页资料" />
            </div>
          </div>
        </article>

        <div className="flow-bridge flow-bridge-input" aria-hidden="true"><span /><i>→</i></div>

        <article className="flow-step flow-step-agents">
          <header className="flow-step-heading">
            <span>02</span>
            <div><small>PROCESS</small><h2>四个 Agent 编排</h2></div>
          </header>

          <div className="flow-agent-stack">
            {AGENT_STEPS.map((agent, index) => (
              <div className={`flow-agent flow-agent-${agent.tone}`} style={{ "--agent-index": index } as React.CSSProperties} key={agent.name}>
                <div><strong>{agent.name}</strong><span>{agent.detail}</span></div>
                <img src={`${ASSET_ROOT}/${agent.icon}`} alt="" />
              </div>
            ))}
          </div>

          <div className="flow-world-file">
            <img src={`${ASSET_ROOT}/world-bolt.png`} alt="" />
            <div><strong>world.json</strong><code>{"{  {...}  }"}</code></div>
          </div>
        </article>

        <div className="flow-bridge flow-bridge-output" aria-hidden="true"><span /><i>→</i></div>

        <article className="flow-step flow-step-result">
          <header className="flow-step-heading">
            <span>03</span>
            <div><small>SPACE</small><h2>长成一座个人房子</h2></div>
          </header>

          <div className="flow-house-visual">
            <span className="flow-house-light" aria-hidden="true" />
            <img className="flow-house" src={`${ASSET_ROOT}/house.png`} alt="由简历内容生成的六个主题空间" />

            <div className="flow-visitor">
              <img className="flow-visitor-avatar" src={`${ASSET_ROOT}/visitor.png`} alt="访客像素人物" />
              <div className="flow-comment">
                <img src={`${ASSET_ROOT}/comment-bubble.png`} alt="" />
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
