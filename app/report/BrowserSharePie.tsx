"use client";

import { useMemo, useState } from "react";

type Props = {
  title?: string;
  shares: Record<string, number>; // 0-1
  variant?: "compact" | "full";
  layout?: "stacked" | "sideBySide";
  legendMax?: number;
};

type Slice = {
  name: string;
  label: string;
  value: number;
  color: string;
};

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toPercent(x: number) {
  return `${(x * 100).toFixed(2)}%`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function getBrowserLabel(name: string) {
  const map: Record<string, string> = {
    Chrome: "Chrome",
    Edge: "Edge",
    "360 Safe": "360浏览器",
    Safari: "Safari",
    "QQ Browser": "QQ浏览器",
    Firefox: "火狐",
  };
  return map[name] || name;
}

export function BrowserSharePie({
  title,
  shares,
  variant = "full",
  layout = "stacked",
  legendMax,
}: Props) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const slices: Slice[] = useMemo(() => {
    const entries = Object.entries(shares || {})
      .map(([name, v]) => ({ name, value: clamp01(Number(v)) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = entries.reduce((s, x) => s + x.value, 0);
    const normalized = total > 0 ? entries.map((x) => ({ ...x, value: x.value / total })) : [];

    return normalized.map((x, idx) => ({
      name: x.name,
      label: getBrowserLabel(x.name),
      value: x.value,
      color: COLORS[idx % COLORS.length]!,
    }));
  }, [shares]);

  const size = variant === "compact" ? 200 : layout === "sideBySide" ? 260 : 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = variant === "compact" ? 78 : layout === "sideBySide" ? 104 : 96;
  const stroke = variant === "compact" ? 20 : layout === "sideBySide" ? 30 : 26;
  const innerR = r - stroke / 2;

  let angle = 0;
  const arcs = slices.map((s) => {
    const start = angle;
    const end = angle + s.value * 360;
    angle = end;
    return { ...s, start, end };
  });

  const legend = typeof legendMax === "number" ? slices.slice(0, legendMax) : slices;

  function LegendItem({ s, idx }: { s: Slice; idx: number }) {
    const active = hoveredName === s.name;
    return (
      <button
        key={s.name}
        type="button"
        onMouseEnter={() => setHoveredName(s.name)}
        onMouseLeave={() => setHoveredName(null)}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-lg px-2 text-left transition-colors",
          variant === "compact" ? "py-1" : "py-1.5",
          active ? "bg-blue-50 ring-2 ring-blue-200/80" : "hover:bg-zinc-50/80",
        ].join(" ")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-zinc-400">{idx + 1}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
          <span className="truncate text-sm text-zinc-700" title={s.name}>
            {s.label}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-600">{toPercent(s.value)}</span>
      </button>
    );
  }

  const chartBlock = (
    <div
      className={
        layout === "sideBySide" ? "relative mx-auto shrink-0 sm:mx-0" : variant === "compact" ? "relative mt-2" : "relative mt-4"
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onMouseLeave={() => setHoveredName(null)}>
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#f4f4f5" strokeWidth={stroke} />
        {arcs.map((a) => {
          const active = hoveredName === a.name;
          return (
            <path
              key={a.name}
              d={describeArc(cx, cy, innerR, a.start, a.end)}
              fill="none"
              stroke={a.color}
              strokeWidth={active ? stroke + 4 : stroke}
              strokeLinecap="butt"
              style={{
                cursor: "pointer",
                filter: active ? "brightness(0.95)" : undefined,
                transition: "stroke-width 120ms ease",
              }}
              onMouseEnter={() => setHoveredName(a.name)}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={innerR - stroke / 2 - 2} fill="white" />
      </svg>
    </div>
  );

  const legendInner =
    legend.length === 0 ? (
      <div className="text-sm text-zinc-500">暂无数据</div>
    ) : layout === "sideBySide" ? (
      <div className="space-y-1">
        {legend.map((s, idx) => (
          <LegendItem key={s.name} s={s} idx={idx} />
        ))}
      </div>
    ) : variant === "compact" ? (
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {(() => {
          const split = Math.ceil(legend.length / 2);
          const left = legend.slice(0, split);
          const right = legend.slice(split);
          return (
            <>
              <div className="space-y-1">
                {left.map((s, idx) => (
                  <LegendItem key={s.name} s={s} idx={idx} />
                ))}
              </div>
              <div className="space-y-1">
                {right.map((s, idx) => (
                  <LegendItem key={s.name} s={s} idx={split + idx} />
                ))}
              </div>
            </>
          );
        })()}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {legend.map((s, idx) => (
          <LegendItem key={s.name} s={s} idx={idx} />
        ))}
      </div>
    );

  const legendBlock = (
    <div
      className={
        layout === "sideBySide" ? "min-w-0 flex-1" : variant === "compact" ? "mt-3 w-full" : "mt-5 w-full"
      }
    >
      {legendInner}
    </div>
  );

  return (
    <div className="w-full">
      {title ? (
        <div className="mb-2 w-full text-left text-xs font-medium text-zinc-500">{title}</div>
      ) : null}
      <div
        className={
          layout === "sideBySide"
            ? "flex w-full flex-col items-stretch gap-6 sm:flex-row sm:items-center"
            : "flex flex-col items-center"
        }
      >
        {chartBlock}
        {legendBlock}
      </div>
    </div>
  );
}
