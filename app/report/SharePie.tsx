"use client";

import React, { useMemo, useState } from "react";

export interface SharePieProps {
  data: Array<{ name: string; value: number }>;
  labelMap?: Record<string, string>;
  title: string;
  subtitle?: string;
  source?: string;
  colors?: string[];
}

type Slice = {
  name: string;
  label: string;
  value: number;
  color: string;
};

/* Spotify 风格配色：暗色背景下可见的配色 */
const EDITORIAL_COLORS = [
  "#1ed760",              /* Spotify 绿 — 主导色 */
  "#b3b3b3",              /* 亮灰 */
  "#535353",              /* 中灰 */
  "#3d9970",              /* 暗绿 */
  "#909090",              /* 浅灰 */
  "#4a7c59",              /* 橄榄绿 */
  "#727272",              /* 灰 */
  "#6b9b7a",              /* 灰绿 */
] as const;

function clampNonNeg(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, x);
}

function toPercent(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(6) : "0";
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${fmt(start.x)} ${fmt(start.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArcFlag} 0 ${fmt(end.x)} ${fmt(end.y)}`;
}

export function SharePie({ data, labelMap, title, subtitle, source, colors }: SharePieProps) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const slices: Slice[] = useMemo(() => {
    const entries = (data || [])
      .map((x) => ({ name: String(x.name), value: clampNonNeg(Number(x.value)) }))
      .filter((x) => x.name && x.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = entries.reduce((s, x) => s + x.value, 0);
    const normalized = total > 0 ? entries.map((x) => ({ ...x, value: x.value / total })) : [];

    const pal = colors && colors.length ? colors : Array.from(EDITORIAL_COLORS);
    return normalized.map((x, idx) => ({
      name: x.name,
      label: (labelMap && labelMap[x.name]) || x.name,
      value: x.value,
      color: pal[idx % pal.length]!,
    }));
  }, [data, labelMap, colors]);

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const stroke = 14;
  const innerR = r - stroke / 2;

  let angle = 0;
  const arcs = slices.map((s) => {
    const start = angle;
    const end = angle + s.value * 360;
    angle = end;
    return { ...s, start, end };
  });

  return (
    <div className="w-full">
      {/* 标题区 */}
      <div className="mb-4">
        <div className="editorial-label mb-0.5">{title}</div>
        {subtitle ? <div className="text-xs text-text-muted">{subtitle}</div> : null}
      </div>

      <div className="grid w-full items-center gap-4" style={{ gridTemplateColumns: `${size}px 1fr` }}>
        {/* 环形图 — 固定列宽，所有卡片对齐 */}
        <div className="relative">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`${title}，${slices.length}项数据`}
            onMouseLeave={() => setHoveredName(null)}
            className="block select-none"
          >
            <title>{title}</title>
            {/* 底圈 */}
            <circle
              cx={cx} cy={cy} r={innerR}
              fill="none"
              stroke="var(--color-border-light)"
              strokeWidth={stroke}
            />
            {/* 数据弧 */}
            {arcs.map((a, idx) => {
              const active = hoveredName === a.name;
              const dimmed = hoveredName != null && !active;
              /* 弧长 = r × 弧度 */
              const arcLen = innerR * ((a.end - a.start) * Math.PI) / 180;
              return (
                <path
                  key={a.name}
                  d={describeArc(cx, cy, innerR, a.start, a.end)}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={active ? stroke + 4 : stroke}
                  strokeLinecap="butt"
                  className="animate-arc-in"
                  style={{
                    cursor: "pointer",
                    opacity: dimmed ? 0.25 : 1,
                    transition: "opacity 150ms ease, stroke-width 150ms ease",
                    animationDelay: `${idx * 80}ms`,
                    strokeDasharray: arcLen,
                    strokeDashoffset: arcLen,
                    "--arc-len": arcLen,
                  } as React.CSSProperties}
                  onMouseEnter={() => setHoveredName(a.name)}
                />
              );
            })}
            {/* 中心白圆 */}
            <circle cx={cx} cy={cy} r={innerR - stroke / 2 - 1} fill="var(--color-bg-base)" />
          </svg>
        </div>

        {/* 图例 — 填满右列 */}
        <div className="min-w-0">
          {slices.length === 0 ? (
            <div className="text-sm text-text-muted">暂无数据</div>
          ) : (
            <div className="space-y-0.5">
              {slices.map((s, idx) => {
                const active = hoveredName === s.name;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onMouseEnter={() => setHoveredName(s.name)}
                    onMouseLeave={() => setHoveredName(null)}
                    className={[
                      "w-full flex items-center gap-2 px-1.5 py-1 text-left transition-colors duration-100 animate-row-in",
                      active ? "bg-bg-surface" : "hover:bg-bg-surface",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-1",
                    ].join(" ")}
                    style={{ borderRadius: "2px", "--stagger": idx } as React.CSSProperties}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0"
                      style={{ backgroundColor: s.color, borderRadius: "1px" }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-xs text-text-secondary whitespace-nowrap" title={s.name}>
                      {s.label}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-text-primary text-right" style={{ minWidth: "3.5em" }}>
                      {toPercent(s.value)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {source ? (
        <div className="mt-3 pt-2 border-t border-border-light text-[11px] text-text-muted leading-snug">{source}</div>
      ) : null}
    </div>
  );
}
