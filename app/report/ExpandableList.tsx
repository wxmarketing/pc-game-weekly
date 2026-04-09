"use client";

import { useState, Children, type ReactNode } from "react";

/**
 * 通用展开/收起列表包装器
 *
 * 接收已渲染好的 children，默认只显示前 `limit` 个。
 * 不改变子组件的布局结构 —— 仅控制可见数量。
 * 按钮风格与 WeGame SubChart 完全一致。
 */
export function ExpandableList({
  children,
  limit = 5,
}: {
  children: ReactNode;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = Children.toArray(children);
  const total = all.length;
  const canToggle = total > limit;
  const shown = expanded ? all : all.slice(0, limit);

  return (
    <>
      {shown}

      {!expanded && canToggle ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn-interactive inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "2px",
              background: "transparent",
            }}
          >
            展开全部 {total} 项
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      ) : null}

      {expanded && canToggle ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="btn-interactive inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "2px",
              background: "transparent",
            }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            收起
          </button>
        </div>
      ) : null}
    </>
  );
}
