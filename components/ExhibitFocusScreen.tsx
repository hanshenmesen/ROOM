"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ExhibitFocusSourceLink = {
  label: string;
  url: string;
};

export type ExhibitFocusImage = {
  src: string;
  alt: string;
};

export type ExhibitFocusSection = {
  title: string;
  meta?: string[];
  body?: string;
  tags?: string[];
};

export type ExhibitFocusScreenProps = {
  open: boolean;
  title: string;
  exhibitType: string;
  body?: string;
  bullets?: string[];
  sections?: ExhibitFocusSection[];
  image?: ExhibitFocusImage;
  sourceLinks?: ExhibitFocusSourceLink[];
  currentIndex?: number;
  totalCount?: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  projectEditSlot?: ReactNode;
  portraitRegenerateSlot?: ReactNode;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export function ExhibitFocusScreen({
  open,
  title,
  exhibitType,
  body,
  bullets = [],
  sections = [],
  image,
  sourceLinks = [],
  currentIndex,
  totalCount,
  onClose,
  onPrevious,
  onNext,
  projectEditSlot,
  portraitRegenerateSlot,
}: ExhibitFocusScreenProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const positionLabel = typeof currentIndex === "number" && typeof totalCount === "number"
    ? `${currentIndex + 1} / ${totalCount}`
    : "";
  const hasNavigation = Boolean(onPrevious || onNext);
  const hasActions = Boolean(projectEditSlot || portraitRegenerateSlot);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;
    const targets = focusableElements(dialogRef.current);
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

  return (
    <div className="exhibit-focus-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="exhibit-focus-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className="exhibit-focus-header">
          <div>
            <span className="exhibit-focus-kicker">EXHIBIT SCREEN · {exhibitType}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="exhibit-focus-window-controls">
            {positionLabel ? <span aria-label="当前展台位置">{positionLabel}</span> : null}
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭展台聚焦视角">
              ×
            </button>
          </div>
        </header>

        <div className="exhibit-focus-scroll-region">
          <div className="exhibit-focus-content">
            {image ? (
              <figure className="exhibit-focus-image">
                <img src={image.src} alt={image.alt} />
              </figure>
            ) : null}

            <div className="exhibit-focus-copy" id={descriptionId}>
              {sections.length ? (
                <div className="exhibit-focus-sections" aria-label="展台内容分组">
                  {sections.map((section, index) => (
                    <article className="exhibit-focus-section" key={`${section.title}:${index}`}>
                      <header className="exhibit-focus-section-header">
                        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <h3>{section.title}</h3>
                          {section.meta?.length ? (
                            <div className="exhibit-focus-section-meta">
                              {section.meta.map((item) => <span key={item}>{item}</span>)}
                            </div>
                          ) : null}
                        </div>
                      </header>
                      {section.body ? <p>{section.body}</p> : null}
                      {section.tags?.length ? (
                        <div className="exhibit-focus-section-tags" aria-label="相关标签">
                          {section.tags.map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : body ? <p>{body}</p> : null}
              {bullets.length ? (
                <ul>
                  {bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {sourceLinks.length ? (
            <nav className="exhibit-focus-sources" aria-label="展台来源链接">
              {sourceLinks.map((link) => (
                <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}

          {hasActions ? (
            <div className="exhibit-focus-actions" aria-label="展台编辑操作">
              {projectEditSlot}
              {portraitRegenerateSlot}
            </div>
          ) : null}
        </div>

        {hasNavigation ? (
          <footer className="exhibit-focus-navigation">
            <button type="button" onClick={onPrevious} disabled={!onPrevious}>
              上一个展台
            </button>
            <button type="button" onClick={onNext} disabled={!onNext}>
              下一个展台
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
