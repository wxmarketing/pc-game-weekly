"use client";

import { useState, type ReactNode } from "react";

/* 顺序与页面 section 出现顺序一致 */
export const NAV_ITEMS = [
  { id: "section-news", label: "行业新鲜事", color: "var(--color-news)" },
  { id: "section-overview", label: "硬件份额", color: "var(--color-accent)" },
  { id: "section-steam", label: "Steam", color: "var(--color-steam)" },
  { id: "section-epic", label: "Epic Games Store", color: "var(--color-epic)" },
  { id: "section-wegame", label: "WeGame", color: "var(--color-wegame)" },
  { id: "section-taptap", label: "TapTap PC", color: "var(--color-taptap)" },
  { id: "section-4399", label: "4399", color: "var(--color-4399)" },
] as const;

export type SectionId = (typeof NAV_ITEMS)[number]["id"];

/**
 * 侧边栏导航 + 内容切换布局
 *
 * - 左侧固定侧边栏，垂直导航项
 * - 右侧内容区顶部：section 标题（左）+ 更新时间（右）
 * - 所有 section 内容作为 children map 传入，section 内部不再包含标题/色条
 */
export function SidebarLayout({
  dataUpdateDate,
  footer,
  sections,
}: {
  /** 格式如 "2026.04.09" */
  dataUpdateDate?: string | null;
  footer: ReactNode;
  sections: Record<string, ReactNode>;
}) {
  const [activeId, setActiveId] = useState<string>(NAV_ITEMS[0].id);

  const activeItem = NAV_ITEMS.find((n) => n.id === activeId) ?? NAV_ITEMS[0];

  return (
    <div className="sidebar-layout">
      {/* 左侧侧边栏 */}
      <aside className="sidebar-nav" aria-label="平台导航">
        {/* Logo / 标题区 */}
        <div className="sidebar-brand">
          <span className="sidebar-brand-title">PC</span>
          <span className="sidebar-brand-subtitle">Signals</span>
        </div>

        {/* 导航项 */}
        <nav className="sidebar-nav-list">
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                className={`sidebar-nav-item${isActive ? " sidebar-nav-item--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span
                  className="sidebar-nav-dot"
                  style={{ background: isActive ? item.color : "var(--color-border-light)" }}
                />
                <span className="sidebar-nav-label">{item.label}</span>
                {isActive && (
                  <span
                    className="sidebar-nav-indicator"
                    style={{ background: item.color }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部信息 */}
        <div className="sidebar-footer">
          <p className="text-[10px] text-text-muted leading-relaxed">
            数据来自公开渠道<br />仅供内部参考
          </p>
        </div>
      </aside>

      {/* 右侧内容区 */}
      <main className="sidebar-content">
        {/* 内容区 Header：section 标题 + 更新时间 */}
        <header className="content-header">
          <div className="content-header-row">
            <div className="content-header-left">
              <h1 className="section-title">{activeItem.label}</h1>
              <div
                className="section-color-bar"
                style={{ background: activeItem.color }}
              />
            </div>
            {dataUpdateDate && (
              <div className="header-update-date">
                <span className="header-update-date-label">更新时间：</span>
                <span className="header-update-date-value">{dataUpdateDate}</span>
              </div>
            )}
          </div>
        </header>

        {/* 当前激活的 section */}
        <div className="sidebar-section-content" key={activeId}>
          {sections[activeId] ?? (
            <div className="py-20 text-center text-sm text-text-muted">暂无内容</div>
          )}
        </div>

        {/* Footer */}
        {footer}
      </main>
    </div>
  );
}
