"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  EvidenceBackedClaim,
  ProfileConflict,
  ProfileMergeReport,
  ProfileReviewAction,
  ProfileReviewResolution,
} from "@/lib/profile-merge";

type ProfileReviewPanelProps = {
  report: ProfileMergeReport;
  onConfirm: (resolutions: ProfileReviewResolution[]) => void;
};

function displayValue(value: string | string[]) {
  return Array.isArray(value) ? value.join(" · ") : value;
}

function ClaimOption({
  conflict,
  source,
  action,
  claim,
  selected,
  onSelect,
}: {
  conflict: ProfileConflict;
  source: string;
  action: "primary" | "supplement";
  claim?: EvidenceBackedClaim<string | string[]>;
  selected: boolean;
  onSelect: () => void;
}) {
  if (!claim) return null;
  return (
    <div className={`profile-review-claim ${selected ? "is-selected" : ""}`}>
      <label className="profile-review-claim-choice">
        <input
          type="radio"
          name={conflict.conflictId}
          checked={selected}
          onChange={onSelect}
        />
        <span className="profile-review-claim-source">
          <strong>{action === "primary" ? "主来源" : "补充来源"}</strong>
          <small>{source}</small>
        </span>
        <b>{displayValue(claim.value)}</b>
        <span className="profile-review-confidence">证据置信度 {Math.round(claim.confidence * 100)}%</span>
      </label>
      <details>
        <summary>查看证据 · {claim.evidence.length} 条</summary>
        {claim.evidence.length ? claim.evidence.map((evidence, index) => (
          <blockquote key={`${evidence.sourceId}-${evidence.locator}-${index}`}>
            <span>{evidence.sourceId} / {evidence.locator}</span>
            <p>{evidence.excerpt}</p>
          </blockquote>
        )) : <p>该候选没有直接来源证据。</p>}
      </details>
    </div>
  );
}

function canReject(conflict: ProfileConflict) {
  if (conflict.target.scope !== "profile") return true;
  return ["location", "personalWebsite"].includes(conflict.target.field);
}

export function ProfileReviewPanel({ report, onConfirm }: ProfileReviewPanelProps) {
  const requiredConflicts = useMemo(() => report.conflicts.filter((conflict) => conflict.required), [report]);
  const [actions, setActions] = useState<Record<string, ProfileReviewAction>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const unresolvedCount = requiredConflicts.filter((conflict) => {
    const action = actions[conflict.conflictId];
    return !action || (action === "edit" && !edits[conflict.conflictId]?.trim());
  }).length;
  const complete = unresolvedCount === 0;

  function select(conflictId: string, action: ProfileReviewAction) {
    setActions((current) => ({ ...current, [conflictId]: action }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    onConfirm(requiredConflicts.map((conflict) => ({
      conflictId: conflict.conflictId,
      action: actions[conflict.conflictId]!,
      ...(actions[conflict.conflictId] === "edit" ? { value: (edits[conflict.conflictId] || "").trim() } : {}),
    })));
  }

  return (
    <form className="creation-studio profile-review-panel" aria-label="Profile 证据冲突确认" onSubmit={submit}>
      <header className="creation-studio-heading">
        <div>
          <span>HUMAN CHECKPOINT / EVIDENCE</span>
          <h2>Agent 发现了需要你确认的信息</h2>
        </div>
        <strong>{String(requiredConflicts.length).padStart(2, "0")}</strong>
      </header>
      <p className="profile-review-intro">
        系统没有静默覆盖冲突值。请结合原始证据选择一个来源，或直接填写正确答案。
      </p>
      <div className="profile-review-list">
        {requiredConflicts.map((conflict, index) => {
          const action = actions[conflict.conflictId];
          return (
            <fieldset key={conflict.conflictId} className="profile-review-conflict">
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{conflict.label}</legend>
              <p>{conflict.reason}</p>
              <div className="profile-review-options">
                <ClaimOption
                  conflict={conflict}
                  source={report.primarySource}
                  action="primary"
                  claim={conflict.primary}
                  selected={action === "primary"}
                  onSelect={() => select(conflict.conflictId, "primary")}
                />
                <ClaimOption
                  conflict={conflict}
                  source={report.supplementSource}
                  action="supplement"
                  claim={conflict.supplement}
                  selected={action === "supplement"}
                  onSelect={() => select(conflict.conflictId, "supplement")}
                />
              </div>
              <label className={`profile-review-edit ${action === "edit" ? "is-selected" : ""}`}>
                <span>
                  <input
                    type="radio"
                    name={conflict.conflictId}
                    checked={action === "edit"}
                    onChange={() => select(conflict.conflictId, "edit")}
                  />
                  我来填写正确值
                </span>
                <input
                  value={edits[conflict.conflictId] || ""}
                  placeholder={`输入正确的${conflict.label}`}
                  maxLength={5_000}
                  onFocus={() => select(conflict.conflictId, "edit")}
                  onChange={(event) => setEdits((current) => ({ ...current, [conflict.conflictId]: event.target.value }))}
                />
              </label>
              {canReject(conflict) ? (
                <label className="profile-review-reject">
                  <input
                    type="radio"
                    name={conflict.conflictId}
                    checked={action === "reject"}
                    onChange={() => select(conflict.conflictId, "reject")}
                  />
                  不公开这个字段
                </label>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <footer className="profile-review-submit">
        <span>{complete ? "所有冲突均已确认" : `还需确认 ${unresolvedCount} 项`}</span>
        <button type="submit" disabled={!complete}>确认并继续生成 <span aria-hidden="true">→</span></button>
      </footer>
    </form>
  );
}
