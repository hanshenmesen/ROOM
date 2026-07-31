"use client";

import { useState, type FormEvent } from "react";
import {
  BROWSER_AGENT_PROVIDER_PRESETS,
  DEFAULT_BROWSER_AGENT_CONFIG,
  browserAgentProviderPreset,
  browserAgentProviderPresetId,
  type BrowserAgentConfig,
  type BrowserAgentProviderPresetId,
} from "@/lib/browser-agent-config";
import type { PublicAgentConfigStatus } from "@/lib/agents/provider-config";

type AgentSetupDialogProps = {
  status: PublicAgentConfigStatus | null;
  config: BrowserAgentConfig | null;
  onClose: () => void;
  onSave: (config: BrowserAgentConfig) => void;
  onClear: () => void;
};

function freshConfig(config: BrowserAgentConfig | null): BrowserAgentConfig {
  return config
    ? { maas: { ...config.maas }, website: { ...config.website }, image: { ...config.image }, petQa: { ...config.petQa } }
    : {
        maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas },
        website: { ...DEFAULT_BROWSER_AGENT_CONFIG.website },
        image: { ...DEFAULT_BROWSER_AGENT_CONFIG.image },
        petQa: { ...DEFAULT_BROWSER_AGENT_CONFIG.petQa },
      };
}

export function AgentSetupDialog({ status, config, onClose, onSave, onClear }: AgentSetupDialogProps) {
  const [draft, setDraft] = useState(() => freshConfig(config));
  const [concurrentWebsiteAgent, setConcurrentWebsiteAgent] = useState(Boolean(config?.website.apiKey));
  const [feedback, setFeedback] = useState("");

  function selectProvider(target: "maas" | "website" | "petQa", presetId: BrowserAgentProviderPresetId) {
    const preset = browserAgentProviderPreset(presetId);
    setDraft((current) => ({
      ...current,
      [target]: {
        ...current[target],
        baseUrl: preset.baseUrl,
        model: preset.model,
        mode: preset.mode,
      },
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.maas.apiKey.trim()) {
      setFeedback("请填写主解析服务的 API Key。");
      return;
    }
    if (concurrentWebsiteAgent && !draft.website.apiKey.trim()) {
      setFeedback("开启并发网站 Agent 后，需要填写第二个 API Key。");
      return;
    }
    onSave({
      maas: {
        apiKey: draft.maas.apiKey.trim(),
        baseUrl: draft.maas.baseUrl.trim(),
        model: draft.maas.model.trim(),
        mode: draft.maas.mode,
      },
      website: {
        apiKey: concurrentWebsiteAgent ? draft.website.apiKey.trim() : "",
        baseUrl: draft.website.baseUrl.trim(),
        model: draft.website.model.trim(),
        mode: draft.website.mode,
      },
      image: {
        apiKey: draft.image.apiKey.trim(),
        baseUrl: draft.image.baseUrl.trim(),
        model: draft.image.model.trim(),
      },
      petQa: {
        apiKey: draft.petQa.apiKey.trim(),
        baseUrl: draft.petQa.baseUrl.trim(),
        model: draft.petQa.model.trim(),
        mode: draft.petQa.mode,
      },
    });
    setFeedback("当前标签页的解析、抽象肖像与宠物 QA 配置已保存，可以直接开始使用。");
  }

  const readyLabel = config
    ? "当前标签页已配置"
    : status?.ready ? "服务端环境变量已就绪" : "填写 Key 后即可解析";

  return (
    <div className="agent-setup-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="agent-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-setup-title">
        <header>
          <div>
            <span>ROOM / AGENT SETUP</span>
            <h2 id="agent-setup-title">配置解析服务</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭解析服务设置">×</button>
        </header>

        <div className={`agent-setup-state ${config || status?.ready ? "is-ready" : "is-missing"}`}>
          <span aria-hidden="true" />
          <div>
            <strong>{readyLabel}</strong>
            <small>韩晨 Demo 始终可以直接进入；下面的配置只用于解析新的简历和个人网站。</small>
          </div>
        </div>

        <form className="agent-config-form" onSubmit={submit}>
          <fieldset>
            <legend><span>01</span> 主解析服务</legend>
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={draft.maas.apiKey}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  maas: { ...current.maas, apiKey: event.target.value },
                }))}
                placeholder="输入所选 Provider 的 API Key"
                autoComplete="off"
              />
            </label>
            <div className="agent-config-row">
              <label>
                <span>Provider / Base URL</span>
                <select
                  aria-label="主解析 Provider"
                  value={browserAgentProviderPresetId(draft.maas)}
                  onChange={(event) => selectProvider("maas", event.target.value as BrowserAgentProviderPresetId)}
                >
                  {BROWSER_AGENT_PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label} · {preset.baseUrl}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <input
                  required
                  value={draft.maas.model}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    maas: { ...current.maas, model: event.target.value },
                  }))}
                />
              </label>
            </div>
            <small>这套配置默认同时处理简历和个人网站。切换 Provider 时会自动更新 Base URL 和推荐 Model。</small>
          </fieldset>

          <fieldset>
            <legend><span>02</span> 抽象肖像图像服务</legend>
            <label>
              <span>图像 API Key（可选）</span>
              <input
                type="password"
                value={draft.image.apiKey}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  image: { ...current.image, apiKey: event.target.value },
                }))}
                placeholder="不填则复用主解析服务 API Key"
                autoComplete="off"
              />
            </label>
            <div className="agent-config-row">
              <label>
                <span>Image Base URL</span>
                <input
                  type="url"
                  required
                  value={draft.image.baseUrl}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    image: { ...current.image, baseUrl: event.target.value },
                  }))}
                  placeholder="https://provider.example/v1"
                />
              </label>
              <label>
                <span>Image Model</span>
                <input
                  required
                  value={draft.image.model}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    image: { ...current.image, model: event.target.value },
                  }))}
                />
              </label>
            </div>
            <small>用于把识别到的真人头像转换为抽象画。不填独立 Key 时复用主解析 Key；服务需兼容 OpenAI Images Edits 接口。</small>
          </fieldset>

          <fieldset>
            <legend><span>03</span> 宠物 QA 服务</legend>
            <label>
              <span>Pet QA API Key（可选）</span>
              <input
                type="password"
                value={draft.petQa.apiKey}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  petQa: { ...current.petQa, apiKey: event.target.value },
                }))}
                placeholder="不填则复用主解析服务 API Key"
                autoComplete="off"
              />
            </label>
            <div className="agent-config-row">
              <label>
                <span>Provider / Base URL</span>
                <select
                  aria-label="宠物 QA Provider"
                  value={browserAgentProviderPresetId(draft.petQa)}
                  onChange={(event) => selectProvider("petQa", event.target.value as BrowserAgentProviderPresetId)}
                >
                  {BROWSER_AGENT_PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label} · {preset.baseUrl}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Pet QA Model</span>
                <input
                  required
                  value={draft.petQa.model}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    petQa: { ...current.petQa, model: event.target.value },
                  }))}
                />
              </label>
            </div>
            <small>大厅宠物会基于已解析的简历/个人网站公开资料回答问题。独立 Key 留空时复用主解析服务；资料外的问题会明确回答不知道。</small>
          </fieldset>

          <details className="agent-advanced" open={concurrentWebsiteAgent || undefined}>
            <summary>高级设置 <span>独立并发网站 Agent</span></summary>
            <div className="agent-advanced-body">
              <label className="agent-concurrency-toggle">
                <input
                  type="checkbox"
                  checked={concurrentWebsiteAgent}
                  onChange={(event) => setConcurrentWebsiteAgent(event.target.checked)}
                />
                <span>
                  <strong>用第二个 Key 并发解析个人网站</strong>
                  <small>简历识别到个人主页后，第二个 Agent 会立即开始抓取和理解网站，与剩余简历解析同时进行。</small>
                </span>
              </label>
              {concurrentWebsiteAgent ? <fieldset>
                <legend><span>04</span> 并发网站 Agent</legend>
                <label>
                  <span>第二个 API Key</span>
                  <input
                    type="password"
                    value={draft.website.apiKey}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      website: { ...current.website, apiKey: event.target.value },
                    }))}
                    placeholder="输入第二个 API Key"
                    autoComplete="off"
                  />
                </label>
                <div className="agent-config-row">
                  <label>
                    <span>Provider / Base URL</span>
                    <select
                      aria-label="并发网站 Provider"
                      value={browserAgentProviderPresetId(draft.website)}
                      onChange={(event) => selectProvider("website", event.target.value as BrowserAgentProviderPresetId)}
                    >
                      {BROWSER_AGENT_PROVIDER_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label} · {preset.baseUrl}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Model</span>
                    <input
                      required
                      value={draft.website.model}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        website: { ...current.website, model: event.target.value },
                      }))}
                    />
                  </label>
                </div>
              </fieldset> : null}
            </div>
          </details>

          <p className="agent-security-note">
            Key 仅保存在当前标签页的 sessionStorage，并只随对应解析、图像或宠物 QA 请求发送给 ROOM 服务端代理；不会写入代码仓库或 localStorage。
          </p>
          <div className="agent-setup-feedback" aria-live="polite">{feedback}</div>
          <footer>
            {config ? <button type="button" onClick={onClear}>清除当前会话配置</button> : <span />}
            <button type="submit">保存并开始使用</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
