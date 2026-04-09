"use client";

import React, { useMemo, useState } from "react";
import { SectionShell, RankBadge } from "./ui";
import type { ReactNode } from "react";

type WgGame = {
  rank: number;
  title: string;
  cover_image: string | null;
  tags: string[];
  price: string | null;
  store_url: string | null;
  weekly_follows: number | null;
};

type Pack = { games: WgGame[]; generatedAt: string | null } | null;

function dateOnlyLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  return s;
}

function normalizeCoverUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}

/** 外部链接 — 无则渲染为 span */
function ExternalLink({
  href,
  className,
  children,
}: {
  href: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const u = href?.trim();
  if (!u) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={u} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * 编辑风榜单行 — 底部细线分隔，无卡片包裹
 * isFollow=true 时为新游预约模式：隐藏"未知"价格，只展示预约数层级
 */
function WgChartRow({ g, isFollow, staggerIndex }: { g: WgGame; isFollow?: boolean; staggerIndex?: number }) {
  const cover = normalizeCoverUrl(g.cover_image);
  const subtitle = g.tags.length ? g.tags.slice(0, 3).join(" · ") : "标签未知";

  /* 价格区域：新游预约模式只显示预约数 */
  const showPrice = !isFollow || (g.price != null && g.price !== "未知" && g.price.trim() !== "");
  const rawPrice = g.price ?? "—";
  const isFreeText = /免费/.test(rawPrice);
  const hasFollows = typeof g.weekly_follows === "number";

  return (
    <div
      className="grid grid-cols-[1.75rem_40px_1fr_auto] sm:grid-cols-[1.75rem_48px_1fr_7rem] items-center gap-3 sm:gap-4 py-3 sm:py-3.5 border-b border-border-light row-hover group animate-row-in"
      style={{ "--stagger": staggerIndex ?? 0 } as React.CSSProperties}
    >
      {/* 排名 */}
      <div className="flex justify-center">
        <RankBadge rank={g.rank} />
      </div>

      {/* 封面 */}
      <div
        className="h-10 w-10 sm:h-12 sm:w-12 overflow-hidden bg-bg-surface"
        style={{ borderRadius: "2px" }}
      >
        {cover ? (
          <img
            src={cover}
            alt={g.title}
            className="h-full w-full object-cover cover-zoom"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">
            —
          </div>
        )}
      </div>

      {/* 标题 + 副标题 */}
      <div className="min-w-0">
        <p className="flex items-center gap-2 min-w-0">
          <ExternalLink
            href={g.store_url}
            className="truncate text-sm font-medium text-text-primary hover:text-text-accent transition-colors duration-150"
          >
            {g.title}
          </ExternalLink>
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>
      </div>

      {/* 价格 / 预约数 */}
      <div className="text-right">
        {isFollow && hasFollows ? (
          /* 新游预约模式：上面小字标签，下面大数字 */
          <div>
            <div className="text-[10px] text-text-muted leading-tight">本周预约</div>
            <div className="text-base font-semibold font-mono tabular-nums text-text-primary leading-tight mt-0.5">
              {g.weekly_follows!.toLocaleString()}
            </div>
          </div>
        ) : isFollow ? (
          /* 新游预约模式但无预约数 */
          <div className="text-xs text-text-muted">—</div>
        ) : (
          /* 普通模式：价格 + 可选预约数 */
          <div className="tabular-nums">
            {showPrice ? (
              isFreeText ? (
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold tracking-wide"
                  style={{
                    background: "var(--color-free-soft)",
                    color: "var(--color-free)",
                    border: "1px solid var(--color-free-border)",
                    borderRadius: "2px",
                  }}>免费</span>
              ) : (
                <div className="text-sm font-medium text-text-primary">{rawPrice}</div>
              )
            ) : null}
            {hasFollows ? (
              <div className={showPrice ? "mt-0.5" : ""}>
                <span className="text-[11px] font-mono tabular-nums text-text-muted">
                  本周预约 {g.weekly_follows!.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 子榜单 — editorial-label + 粗线顶部 + 展开/收起
 */
function SubChart({
  title,
  pack,
  isFollow,
}: {
  title: string;
  pack: Pack;
  isFollow?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const games = pack?.games ?? [];
  const shown = expanded ? games : games.slice(0, 5);
  const canToggle = games.length > 5;

  return (
    <div>
      {/* 子标题行 */}
      <div className="flex items-baseline justify-between mb-4">
        <span className="editorial-label">{title}</span>
        <span className="text-xs text-text-muted font-mono tabular-nums">
          {dateOnlyLabel(pack?.generatedAt)}
        </span>
      </div>

      {/* 列表 */}
      <div className="border-t-2 border-border-rule">
        {shown.length ? (
          shown.map((g, idx) => <WgChartRow key={g.rank} g={g} isFollow={isFollow} staggerIndex={idx} />)
        ) : (
          <div className="py-6 text-sm text-text-muted text-center">暂无数据</div>
        )}
      </div>

      {/* 展开 / 收起 */}
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
            展开全部 {games.length} 项
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
    </div>
  );
}

export function WeGameSection({
  bestseller,
  purchase,
  follow,
}: {
  bestseller: Pack;
  purchase: Pack;
  follow: Pack;
}) {
  const charts = useMemo(
    () => [
      { title: "火爆新品", pack: bestseller, isFollow: false },
      { title: "本周热销", pack: purchase, isFollow: false },
      { title: "新游预约", pack: follow, isFollow: true },
    ],
    [bestseller, purchase, follow],
  );

  return (
    <SectionShell id="section-wegame" colorVar="--color-wegame" title="WeGame">
      <div className="grid gap-10">
        {charts.map((c) => (
          <SubChart key={c.title} title={c.title} pack={c.pack} isFollow={c.isFollow} />
        ))}
      </div>
    </SectionShell>
  );
}
