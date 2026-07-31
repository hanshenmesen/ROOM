"use client";

import { useMemo, useState, type FormEvent } from "react";
import { browserPetQaConfigHeaders, type BrowserAgentConfig } from "@/lib/browser-agent-config";
import type { ParsedProfile } from "@/lib/types";

type PetQaMessage = {
  role: "user" | "assistant";
  content: string;
};

type PetQaCitation = {
  itemId: string;
  title: string;
  excerpt: string;
};

type PetQaPanelProps = {
  profile: ParsedProfile | null;
  config: BrowserAgentConfig | null;
  open: boolean;
  onClose: () => void;
};

export function PetQaPanel({ profile, config, open, onClose }: PetQaPanelProps) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<PetQaMessage[]>([]);
  const [citations, setCitations] = useState<PetQaCitation[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title = useMemo(() => {
    const owner = profile?.name?.trim() || "主人";
    return `${owner}的小助手`;
  }, [profile?.name]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    if (!profile) {
      setError("请先完成资料解析，再向大厅宠物提问。");
      return;
    }
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/pet-qa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...browserPetQaConfigHeaders(config),
        },
        body: JSON.stringify({
          profile,
          question: trimmed,
          history: messages.slice(-8),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        answer?: string;
        citations?: PetQaCitation[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "宠物 QA 暂时不可用。");
      const answer = payload?.answer?.trim() || "我还不知道怎么回答这个问题。";
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
      setCitations(Array.isArray(payload?.citations) ? payload.citations : []);
    } catch (caught) {
      setMessages(messages);
      setError(caught instanceof Error ? caught.message : "宠物 QA 暂时不可用。");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <aside id="pet-qa-panel" className="pet-qa-panel" aria-label="大厅宠物问答">
      <header>
        <div>
          <span>ROOM PET QA</span>
          <h2>{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭宠物问答">×</button>
      </header>
      <div className="pet-qa-body" role="log" aria-live="polite">
        {messages.length ? messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={`pet-qa-message is-${message.role}`}>
            {message.content}
          </p>
        )) : (
          <p className="pet-qa-empty">我可以根据已解析的简历和个人网站资料，帮主人回答项目、经历、技能相关问题。</p>
        )}
        {pending ? <p className="pet-qa-message is-assistant">我正在翻资料……</p> : null}
      </div>
      {citations.length ? (
        <div className="pet-qa-citations" aria-label="回答引用">
          {citations.map((citation) => (
            <article key={`${citation.itemId}-${citation.excerpt}`}>
              <strong>{citation.title}</strong>
              <small>{citation.excerpt}</small>
            </article>
          ))}
        </div>
      ) : null}
      {error ? <p className="pet-qa-error" role="alert">{error}</p> : null}
      <form onSubmit={submit}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={800}
          placeholder="问它一个和主人简历相关的问题"
          aria-label="宠物 QA 问题"
        />
        <button type="submit" disabled={pending || !question.trim()}>
          {pending ? "回答中" : "发送"}
        </button>
      </form>
    </aside>
  );
}
