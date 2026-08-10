"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  BROWSER_AGENT_PROVIDER_PRESETS,
  CUSTOM_BROWSER_AGENT_PROVIDER_ID,
  DEFAULT_BROWSER_AGENT_CONFIG,
  browserAgentProviderPreset,
  browserAgentProviderPresetId,
  presetListRequiresUserEmail,
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

const EMPTY_PROVIDER_DRAFT = {
  apiKey: "",
  baseUrl: "",
  model: "",
  mode: "tool" as const,
  protocol: "anthropic" as const,
  authMode: "bearer" as const,
  userEmail: "",
  appId: "",
};
const EMPTY_IMAGE_DRAFT = { apiKey: "", baseUrl: "", model: "" };

function freshConfig(config: BrowserAgentConfig | null): BrowserAgentConfig {
  return config
    ? { maas: { ...config.maas }, website: { ...config.website }, image: { ...config.image }, petQa: { ...config.petQa } }
    : {
        // Start from empty fields: no preset values are pre-filled. The user
        // picks a Provider (which fills baseUrl/model) or types everything
        // by hand; saving persists to this tab's sessionStorage as before.
        maas: { ...EMPTY_PROVIDER_DRAFT },
        website: { ...DEFAULT_BROWSER_AGENT_CONFIG.website },
        image: { ...EMPTY_IMAGE_DRAFT },
        petQa: { ...EMPTY_PROVIDER_DRAFT },
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
    || config.petQa.protocol !== config.maas.protocol
    || config.petQa.authMode !== config.maas.authMode
    || config.petQa.appId !== config.maas.appId
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
  // Public presets ship with the repo; deployment-specific gateways arrive
  // from the server via /api/config (only present when env-configured).
  const presets = status?.presets?.length ? status.presets : BROWSER_AGENT_PROVIDER_PRESETS;
  const [primaryProviderId, setPrimaryProviderId] = useState<BrowserAgentProviderPresetId>(() => (
    config ? browserAgentProviderPresetId(config.maas, presets) : ""
  ));
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
    setPrimaryProviderId(presetId);
    if (presetId === CUSTOM_BROWSER_AGENT_PROVIDER_ID) {
      setDraft((current) => ({
        ...current,
        maas: {
          ...current.maas,
          baseUrl: "",
          model: "",
          mode: "tool",
          protocol: "anthropic",
          authMode: "bearer",
          userEmail: "",
          appId: "",
        },
      }));
      return;
    }
    const preset = browserAgentProviderPreset(presetId, presets);
    setDraft((current) => ({
      ...current,
      maas: {
        ...current.maas,
        baseUrl: preset.baseUrl,
        model: preset.model,
        mode: preset.mode,
        protocol: preset.protocol || "anthropic",
        authMode: preset.authMode || "bearer",
        userEmail: preset.requiresUserEmail ? current.maas.userEmail : "",
        appId: "",
      },
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.maas.baseUrl.trim()) {
      setFeedback("请选择主服务的 Provider。");
      return;
    }
    if (!draft.maas.model.trim()) {
      setFeedback("请填写主服务的 Model。");
      return;
    }
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
      protocol: draft.maas.protocol,
      authMode: draft.maas.authMode,
      userEmail: draft.maas.userEmail.trim(),
      appId: draft.maas.appId.trim(),
    };
    onSave({
      maas,
      website: concurrentWebsiteAgent
        ? {
            apiKey: draft.website.apiKey.trim(),
            baseUrl: draft.website.baseUrl.trim(),
            model: draft.website.model.trim(),
            mode: draft.website.mode,
            protocol: draft.website.protocol,
            authMode: draft.website.authMode,
            userEmail: draft.website.userEmail.trim(),
            appId: draft.website.appId.trim(),
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
            protocol: draft.petQa.protocol,
            authMode: draft.petQa.authMode,
            userEmail: draft.petQa.userEmail.trim(),
            appId: draft.petQa.appId.trim(),
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
                    value={primaryProviderId}
                    onChange={(event) => selectPrimaryProvider(event.target.value as BrowserAgentProviderPresetId)}
                  >
                    <option value="" disabled>请选择 Provider</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                    <option value={CUSTOM_BROWSER_AGENT_PROVIDER_ID}>自定义 Provider</option>
                  </select>
                </label>
                <label>
                  <span>Model</span>
                  <input
                    required
                    value={draft.maas.model}
                    placeholder="选择 Provider 后自动填入，也可手动修改"
                    onChange={(event) => {
                      setPrimaryProviderId(CUSTOM_BROWSER_AGENT_PROVIDER_ID);
                      setDraft((current) => ({
                        ...current,
                        maas: { ...current.maas, model: event.target.value },
                      }));
                    }}
                  />
                </label>
              </div>
              <label>
                <span>Base URL</span>
                <input
                  type="url"
                  required
                  value={draft.maas.baseUrl}
                  onChange={(event) => {
                    setPrimaryProviderId(CUSTOM_BROWSER_AGENT_PROVIDER_ID);
                    setDraft((current) => ({
                      ...current,
                      maas: { ...current.maas, baseUrl: event.target.value },
                    }));
                  }}
                  placeholder="https://api.example.com/anthropic"
                  autoComplete="url"
                />
              </label>
              <div className="agent-config-row">
                <label>
                  <span>API 协议</span>
                  <select
                    value={draft.maas.protocol}
                    onChange={(event) => {
                      setPrimaryProviderId(CUSTOM_BROWSER_AGENT_PROVIDER_ID);
                      const protocol = event.target.value === "openai" ? "openai" as const : "anthropic" as const;
                      setDraft((current) => ({
                        ...current,
                        maas: { ...current.maas, protocol, mode: protocol === "openai" ? "tool" : current.maas.mode },
                      }));
                    }}
                  >
                    <option value="anthropic">Anthropic Messages</option>
                    <option value="openai">OpenAI Chat Completions</option>
                  </select>
                </label>
                {draft.maas.protocol === "openai" ? (
                  <label>
                    <span>认证 Header</span>
                    <select
                      value={draft.maas.authMode}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        maas: { ...current.maas, authMode: event.target.value === "api-key" ? "api-key" : "bearer" },
                      }))}
                    >
                      <option value="bearer">Authorization: Bearer</option>
                      <option value="api-key">api-key</option>
                    </select>
                  </label>
                ) : <span />}
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
              {presetListRequiresUserEmail(presets, draft.maas.baseUrl) || draft.maas.protocol === "openai" ? (
                <label>
                  <span>x-maas-user-email {presetListRequiresUserEmail(presets, draft.maas.baseUrl) ? "" : "（可选）"}</span>
                  <input
                    type="email"
                    required={presetListRequiresUserEmail(presets, draft.maas.baseUrl)}
                    value={draft.maas.userEmail}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      maas: { ...current.maas, userEmail: event.target.value },
                    }))}
                    placeholder="you@example.com"
                    autoComplete="off"
                  />
                </label>
              ) : null}
              {draft.maas.protocol === "openai" ? (
                <label>
                  <span>x-maas-app-id（可选）</span>
                  <input
                    value={draft.maas.appId}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      maas: { ...current.maas, appId: event.target.value },
                    }))}
                    placeholder="仅填写 Header 值"
                    autoComplete="off"
                  />
                </label>
              ) : null}
              <small>Anthropic 协议调用 /v1/messages；OpenAI 协议调用 /v1/chat/completions。若 Base URL 已以 /v1 结尾，不会重复拼接。主服务用于简历解析、个人网页理解和宠物问答。</small>
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
                    <div className="agent-config-row">
                      <label>
                        <span>API 协议</span>
                        <select value={draft.website.protocol} onChange={(event) => {
                          const protocol = event.target.value === "openai" ? "openai" as const : "anthropic" as const;
                          setDraft((current) => ({ ...current, website: { ...current.website, protocol, mode: protocol === "openai" ? "tool" : current.website.mode } }));
                        }}>
                          <option value="anthropic">Anthropic Messages</option>
                          <option value="openai">OpenAI Chat Completions</option>
                        </select>
                      </label>
                      {draft.website.protocol === "openai" ? (
                        <label>
                          <span>认证 Header</span>
                          <select value={draft.website.authMode} onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, authMode: event.target.value === "api-key" ? "api-key" : "bearer" } }))}>
                            <option value="bearer">Authorization: Bearer</option>
                            <option value="api-key">api-key</option>
                          </select>
                        </label>
                      ) : <span />}
                    </div>
                    {presetListRequiresUserEmail(presets, draft.website.baseUrl) || draft.website.protocol === "openai" ? (
                      <label>
                        <span>x-maas-user-email {presetListRequiresUserEmail(presets, draft.website.baseUrl) ? "" : "（可选）"}</span>
                        <input
                          type="email"
                          required={presetListRequiresUserEmail(presets, draft.website.baseUrl)}
                          value={draft.website.userEmail}
                          onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, userEmail: event.target.value } }))}
                          placeholder="you@example.com"
                          autoComplete="off"
                        />
                      </label>
                    ) : null}
                    {draft.website.protocol === "openai" ? (
                      <label><span>x-maas-app-id（可选）</span><input value={draft.website.appId} onChange={(event) => setDraft((current) => ({ ...current, website: { ...current.website, appId: event.target.value } }))} autoComplete="off" /></label>
                    ) : null}
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
                    <div className="agent-config-row">
                      <label>
                        <span>API 协议</span>
                        <select value={draft.petQa.protocol} onChange={(event) => {
                          const protocol = event.target.value === "openai" ? "openai" as const : "anthropic" as const;
                          setDraft((current) => ({ ...current, petQa: { ...current.petQa, protocol, mode: protocol === "openai" ? "tool" : current.petQa.mode } }));
                        }}>
                          <option value="anthropic">Anthropic Messages</option>
                          <option value="openai">OpenAI Chat Completions</option>
                        </select>
                      </label>
                      {draft.petQa.protocol === "openai" ? (
                        <label>
                          <span>认证 Header</span>
                          <select value={draft.petQa.authMode} onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, authMode: event.target.value === "api-key" ? "api-key" : "bearer" } }))}>
                            <option value="bearer">Authorization: Bearer</option>
                            <option value="api-key">api-key</option>
                          </select>
                        </label>
                      ) : <span />}
                    </div>
                    {presetListRequiresUserEmail(presets, draft.petQa.baseUrl) || draft.petQa.protocol === "openai" ? (
                      <label>
                        <span>x-maas-user-email（可选）</span>
                        <input
                          type="email"
                          value={draft.petQa.userEmail}
                          onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, userEmail: event.target.value } }))}
                          placeholder="留空则复用主服务邮箱"
                          autoComplete="off"
                        />
                      </label>
                    ) : null}
                    {draft.petQa.protocol === "openai" ? (
                      <label><span>x-maas-app-id（可选）</span><input value={draft.petQa.appId} onChange={(event) => setDraft((current) => ({ ...current, petQa: { ...current.petQa, appId: event.target.value } }))} autoComplete="off" /></label>
                    ) : null}
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
