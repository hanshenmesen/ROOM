"use client";

import type { ExhibitHeatItem } from "@/lib/exhibit-heat";

type ExhibitHeatPanelProps = {
  items: ExhibitHeatItem[];
  open: boolean;
  onToggle: () => void;
  onSelect: (item: ExhibitHeatItem) => void;
};

export function ExhibitHeatPanel({ items, open, onToggle, onSelect }: ExhibitHeatPanelProps) {
  return (
    <aside className={`heat-sidebar ${open ? "is-open" : ""}`} aria-label="展台热度统计">
      <button className="heat-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        <span>{open ? "收起热度" : "展台热度"}</span>
        <strong>{items.reduce((total, item) => total + item.total, 0)}</strong>
      </button>
      {open ? (
        <div className="heat-panel">
          <header><div><p>PHYSICAL STANDS</p><h2>实体展台热度</h2></div><small>可聚焦展台 · 预设 + 本机累计</small></header>
          <ol>
            {items.map((item, index) => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelect(item)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.label}</strong><small>{item.kind === "project-pedestal" ? "项目展台" : "信息展台"} · {item.eyebrow}</small></div>
                  <em>{item.total}</em>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </aside>
  );
}
