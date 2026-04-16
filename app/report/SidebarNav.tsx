"use client";

import { useState, type ReactNode } from "react";

/* 导航项类型 */
interface NavItem {
  id: string;
  label: string;
  color: string;
  isGroup?: boolean;
  children?: NavItem[];
}

/* 商店榜单子项 */
export const STORE_ITEMS: NavItem[] = [
  { id: "section-steam", label: "Steam", color: "var(--color-steam)" },
  { id: "section-epic", label: "Epic Games Store", color: "var(--color-epic)" },
  { id: "section-wegame", label: "WeGame", color: "var(--color-wegame)" },
  { id: "section-taptap", label: "TapTap PC", color: "var(--color-taptap)" },
  { id: "section-4399", label: "4399", color: "var(--color-4399)" },
];

/* 一级导航项 */
export const NAV_ITEMS: NavItem[] = [
  { id: "section-news", label: "行业新鲜事", color: "var(--color-news)" },
  { id: "store-group", label: "商店榜单", color: "var(--color-steam)", isGroup: true, children: STORE_ITEMS },
  { id: "section-overview", label: "硬件份额", color: "var(--color-accent)" },
];

export type SectionId = 
  | "section-news" 
  | "section-steam" 
  | "section-epic" 
  | "section-wegame" 
  | "section-taptap" 
  | "section-4399" 
  | "section-overview";

/* 获取当前激活项的信息 */
function getActiveItemInfo(activeId: string): NavItem {
  // 先检查是否是商店子项
  const storeChild = STORE_ITEMS.find((s) => s.id === activeId);
  if (storeChild) return storeChild;
  // 检查一级项（排除 group）
  const topLevel = NAV_ITEMS.find((n) => n.id === activeId && !n.isGroup);
  if (topLevel) return topLevel;
  // 默认返回第一个
  return NAV_ITEMS[0];
}

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
  const [activeId, setActiveId] = useState<string>("section-news");
  const [storeExpanded, setStoreExpanded] = useState(false);

  const activeItem = getActiveItemInfo(activeId);

  // 检查当前选中的是否是商店子项
  const isStoreChild = STORE_ITEMS.some((s) => s.id === activeId);

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
            // 分组项（商店榜单）
            if (item.isGroup && item.children) {
              const isGroupActive = isStoreChild;
              return (
                <div key={item.id} className="sidebar-nav-group">
                  <button
                    onClick={() => {
                      if (!storeExpanded) {
                        // 展开时默认选中第一个子项 (Steam)
                        setStoreExpanded(true);
                        setActiveId(item.children![0].id);
                      } else {
                        // 折叠
                        setStoreExpanded(false);
                      }
                    }}
                    className={`sidebar-nav-item sidebar-nav-item--group${isGroupActive ? " sidebar-nav-item--active" : ""}`}
                  >
                    <span
                      className="sidebar-nav-dot"
                      style={{ background: isGroupActive ? item.color : "var(--color-border-light)" }}
                    />
                    <span className="sidebar-nav-label">{item.label}</span>
                    <svg
                      className={`sidebar-nav-chevron${storeExpanded ? " sidebar-nav-chevron--open" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {isGroupActive && (
                      <span
                        className="sidebar-nav-indicator"
                        style={{ background: item.color }}
                      />
                    )}
                  </button>
                  {/* 子项列表 */}
                  <div className={`sidebar-nav-children${storeExpanded ? " sidebar-nav-children--open" : ""}`}>
                    <div className="sidebar-nav-children-inner">
                      {item.children.map((child) => {
                        const isChildActive = activeId === child.id;
                        return (
                          <button
                            key={child.id}
                            onClick={() => setActiveId(child.id)}
                            className={`sidebar-nav-item sidebar-nav-item--child${isChildActive ? " sidebar-nav-item--active" : ""}`}
                            aria-current={isChildActive ? "page" : undefined}
                          >
                            <span
                              className="sidebar-nav-dot"
                              style={{ background: isChildActive ? child.color : "var(--color-border-light)" }}
                            />
                            <span className="sidebar-nav-label">{child.label}</span>
                            {isChildActive && (
                              <span
                                className="sidebar-nav-indicator"
                                style={{ background: child.color }}
                             />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            // 普通一级项
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
