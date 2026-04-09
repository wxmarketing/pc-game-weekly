"use client";

import { useEffect, useState, useRef } from "react";

/* 顺序与页面 section 出现顺序一致 */
const NAV_ITEMS = [
  { id: "section-news", label: "每周新闻", color: "var(--color-news)" },
  { id: "section-overview", label: "行业大盘", color: "var(--color-accent)" },
  { id: "section-steam", label: "Steam", color: "var(--color-steam)" },
  { id: "section-epic", label: "Epic", color: "var(--color-epic)" },
  { id: "section-wegame", label: "WeGame", color: "var(--color-wegame)" },
  { id: "section-taptap", label: "TapTap", color: "var(--color-taptap)" },
  { id: "section-4399", label: "4399", color: "var(--color-4399)" },
] as const;

const NAV_HEIGHT = 48; // px — 与 CSS .sticky-nav 高度同步

/**
 * Sticky 平台导航条
 *
 * - 始终 sticky 在视口顶部
 * - 滚动超过 header 后显示毛玻璃背景 + 底部细线
 * - IntersectionObserver 自动跟踪当前 section
 * - 底部有一条随活跃项滑动的 indicator 线
 */
export function PlatformNav() {
  const [activeId, setActiveId] = useState<string>("");
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  /* ---- 监听滚动，切换毛玻璃背景 ---- */
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 120);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---- scroll 驱动跟踪当前 section ---- */
  useEffect(() => {
    // 按页面顺序收集所有 section 元素
    const orderedIds: string[] = NAV_ITEMS.map((n) => n.id);
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-section-id]"),
    )
      .filter((el) => orderedIds.includes(el.dataset.sectionId ?? ""))
      .sort(
        (a, b) =>
          orderedIds.indexOf(a.dataset.sectionId!) -
          orderedIds.indexOf(b.dataset.sectionId!),
      );

    if (elements.length === 0) return;

    // 阈值：导航栏底部偏下一点
    const threshold = NAV_HEIGHT + 32;

    function update() {
      // 从后往前找第一个 top <= threshold 的 section（即最后一个滚过导航的）
      let current = elements[0]!.dataset.sectionId!;
      for (let i = elements.length - 1; i >= 0; i--) {
        const rect = elements[i]!.getBoundingClientRect();
        if (rect.top <= threshold) {
          current = elements[i]!.dataset.sectionId!;
          break;
        }
      }
      setActiveId(current);
    }

    update(); // 初始化
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  /* ---- 点击跳转 ---- */
  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }

  /* ---- indicator 位置 ---- */
  const activeBtn = activeId ? itemRefs.current.get(activeId) : null;
  const innerEl = innerRef.current;
  let indicatorStyle: React.CSSProperties = { opacity: 0 };
  if (activeBtn && innerEl) {
    const innerRect = innerEl.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicatorStyle = {
      left: btnRect.left - innerRect.left + innerEl.scrollLeft,
      width: btnRect.width,
      opacity: 1,
    };
  }

  return (
    <nav
      ref={navRef}
      className={`sticky-nav${scrolled ? " sticky-nav--scrolled" : ""}`}
      aria-label="平台导航"
    >
      <div ref={innerRef} className="sticky-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
              }}
              onClick={() => handleClick(item.id)}
              className={`platform-mark${isActive ? " platform-mark--active" : ""}`}
              style={{ color: item.color, cursor: "pointer" }}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="platform-dot" style={{ background: item.color }} />
              {item.label}
            </button>
          );
        })}

        {/* 底部滑动 indicator */}
        <span
          className="sticky-nav-indicator"
          style={indicatorStyle}
          aria-hidden="true"
        />
      </div>
    </nav>
  );
}
