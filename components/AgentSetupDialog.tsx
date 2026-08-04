"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

function hasCustomImage(config: BrowserAgentConfig | null) {
  return Boolean(
    config?.image.apiKey
    || (config && config.image.baseUrl !== DEFAULT_BROWSER_AGENT_CONFIG.image.baseUrl)
    || (config && config.image.model !== DEFAULT_BROWSER_AGENT_CONFIG.image.model),
  );
}

function hasCustomPetQa(config: BrowserAgentConfig | null) {
  return Boolean(config && (
    config.petQa.apiKey
    || config.petQa.baseUrl !== config.maas.baseUrl
    || config.petQa.model !== config.maas.model
    || config.petQa.mode !== config.maas.mode
  ));
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AgentSetupDialog({ status, config, onClose, onSave, onClear }: AgentSetupDialogProps) {
  const [draft, setDraft] = useState(() => freshConfig(config));
  const [concurrentWebsiteAgent, setConcurrentWebsiteAgent] = useState(Boolean(config?.website.apiKey));
  const [customImageProvider, setCustomImageProvider] = useState(() => hasCustomImage(config));
  const [customPetQaProvider, setCustomPetQaProvider] = useState(() => hasCustomPetQa(config));
  const [feedback, setFeedback] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;
    const targets = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
    if (targets.length === 0) return;

    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function selectPrimaryProvider(presetId: BrowserAgentProviderPresetId) {
    const preset = browserAgentProviderPreset(presetId);
    setDraft((current) => ({
      ...current,
      maas: {
        ...current.maas,
        baseUrl: preset.baseUrl,
        model: preset.model,
        mode: preset.mode,
      },
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.maas.apiKey.trim()) {
      setFeedback("请填写主服务的 API Key。");
      return;
    }
    if (concurrentWebsiteAgent && !draft.website.apiKey.trim()) {
      setFeedback("开启并发网站 Agent 后，需要填写第二个 API Key。");
      return;
    }

    const maas = {
      apiKey: draft.maas.apiKey.trim(),
      baseUrl: draft.maas.baseUrl.trim(),
      model: draft.maas.model.trim(),
      mode: draft.maas.mode,
    };
    onSave({
      maas,
      website: concurrentWebsiteAgent
        ? {
            apiKey: draft.website.apiKey.trim(),
            baseUrl: draft.website.baseUrl.trim(),
            model: draft.website.model.trim(),
            mode: draft.website.mode,
          }
        : { ...maas, apiKey: "" },
      image: customImageProvider
        ? {
            apiKey: draft.image.apiKey.trim(),
            baseUrl: draft.image.baseUrl.trim(),
            model: draft.image.model.trim(),
          }
        : { ...DEFAULT_BROWSER_AGENT_CONFIG.image, apiKey: "" },
      petQa: customPetQaProvider
        ? {
            apiKey: draft.petQa.apiKey.trim(),
            baseUrl: draft.petQa.baseUrl.trim(),
            model: draft.petQa.model.trim(),
            mode: draft.petQa.mode,
          }
        : { ...maas, apiKey: "" },
    });
    setFeedback("当前标签页的主服务与能力路由已保存，可以直接开始使用。");
  }

  const readyLabel = config
    ? "当前标签页已配置"
    : status?.ready ? "服务端环境变量已就绪" : "填写 Key 后即可解析";

  return (
    <div className="agent-setup-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="agent-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-setup-title" onKeyDown={handleKeyDown}>
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
            <small>林澈虚构 Demo 始终可以直接进入；新资料默认只需要配置一套主服务。</small>
          </div>
        </div>

        <form className="agent-config-form" onSubmit={submit}>
          <div className="agent-config-scroll">
            <fieldset>
              <legend><span>01</span> 主服务</legend>
              <div className="agent-config-row">
                <label>
                  <span>Provider</span>
                  <select
                    ref={firstFieldRef}
                    aria-label="主解析 Provider"
                    value={browserAgentProviderPresetId(draft.maas)}
                    onChange={(event) => selectPrimaryProvider(event.target.value as BrowserAgentProviderPresetId)}
                  >
                    {BROWSER_AGENT_PROVIDER_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
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
              <small>用于简历解析、个人网页理解和宠物问答；抽象肖像默认复用这个 Key。</small>
            </fieldset>

            <section className="agent-routing-card" aria-labelledby="agent-routing-title">
              <div>
                <span>02</span>
                <strong id="agent-routing-title">能力路由</strong>
              </div>
              <ul>
                <li><span>简历解析</span><strong>主服务</strong></li>
                <li><span>个人网页</span><strong>{concurrentWebsiteAgent ? "独立并发" : "主服务"}</strong></li>
                <li><span>抽象肖像</span><strong>{customImageProvider ? "已自定义" : "复用主 Key"}</strong></li>
                <li><span>宠物 QA</span><strong>{customPetQaProvider ? "已自定义" : "主服务"}</strong></li>
              </ul>
            </section>

            <details className="agent-advanced" open={concurrentWebsiteAgent || customImageProvider || customPetQaProvider || undefined}>
              <summary>高级设置 <span>仅在需要独立服务时修改</span></summary>
              <div className="agent-advanced-body">
                <label className="agent-concurrency-toggle">
                  <input
                    type="checkbox"
                    checked={concurrentWebsiteAgent}
                    onChange={(event) => setConcurrentWebsiteAgent(event.target.checked)}
                  />
                  <span>
                    <strong>独立并发网站 Agent</strong>
                    <small>用第二个 Key 与简历解析并行处理个人网站，加快复杂资料的生成。</small>
                  </span>
                </label>
                {concurrentWebsiteAgent ? (
                  <fieldset>
                    <legend>网站 Agent 覆盖</legend>
                    <label><span>第二个 API Key</span><input type="password" value={draft.website.apiKey} onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, apiKey: event.target.value } }))} autoComplete="off" /></label>
                    <div className="agent-config-row">
                      <label><span>Base URL</span><input type="url" required value={draft.website.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, baseUrl: event.target.value } }))} /></label>
                      <label><span>Model</span><input required value={draft.website.model} onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, model: event.target.value } }))} /></label>
                    </div>
                  </fieldset>
                ) : null}

                <label className="agent-concurrency-toggle">
                  <input type="checkbox" checked={customImageProvider} onChange={(event) => setCustomImageProvider(event.target.checked)} />
                  <span>
                    <strong>自定义抽象肖像图像服务</strong>
                    <small>默认复用主 Key 与内置图像模型；只有独立 Endpoint 或 Model 时才需要开启。</small>
                  </span>
                </label>
                {customImageProvider ? (
                  <fieldset>
                    <legend>图像服务覆盖</legend>
                    <label><span>图像 API Key（可选）</span><input type="password" value={draft.image.apiKey} onChange={(event) => setDraft((current) => ({ ...current, image: { ...current.image, apiKey: event.target.value } }))} placeholder="留空则复用主 Key" autoComplete="off" /></label>
                    <div className="agent-config-row">
                      <label><span>Image Base URL</span><input type="url" required value={draft.image.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, image: { ...current.image, baseUrl: event.target.value } }))} /></label>
                      <label><span>Image Model</span><input required value={draft.image.model} onChange={(event) => setDraft((current) => ({ ...current, image: { ...current.image, model: event.target.value } }))} /></label>
                    </div>
                  </fieldset>
                ) : null}

                <label className="agent-concurrency-toggle">
                  <input type="checkbox" checked={customPetQaProvider} onChange={(event) => setCustomPetQaProvider(event.target.checked)} />
                  <span>
                    <strong>自定义宠物 QA 服务</strong>
                    <small>默认与主服务使用相同 Provider、Key 和 Model。</small>
                  </span>
                </label>
                {customPetQaProvider ? (
                  <fieldset>
                    <legend>宠物 QA 覆盖</legend>
                    <label><span>Pet QA API Key（可选）</span><input type="password" value={draft.petQa.apiKey} onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, apiKey: event.target.value } }))} placeholder="留空则复用主 Key" autoComplete="off" /></label>
                    <div className="agent-config-row">
                      <label><span>Base URL</span><input type="url" required value={draft.petQa.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, baseUrl: event.target.value } }))} /></label>
                      <label><span>Model</span><input required value={draft.petQa.model} onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, model: event.target.value } }))} /></label>
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </details>

            <p className="agent-security-note">
              Key 仅保存在当前标签页的 sessionStorage，并只随对应请求发送给 ROOM 服务端代理；不会写入代码仓库或 localStorage。
            </p>
            <div className="agent-setup-feedback" aria-live="polite">{feedback}</div>
          </div>
          <footer className={config ? undefined : "is-single"}>
            {config ? <button type="button" onClick={onClear}>清除当前会话配置</button> : <span />}
            <button type="submit">保存并开始使用</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
