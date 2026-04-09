import type { ReactNode } from "react";
import { ScrollReveal } from "./ScrollReveal";

/**
 * 平台品牌色小方块标记
 */
export function BrandDot({ colorVar }: { colorVar: string }) {
  return (
    <span
      className="platform-dot"
      style={{ background: `var(${colorVar})` }}
      aria-hidden="true"
    />
  );
}

/**
 * 杂志编辑风 Section 外壳
 * 
 * 不再用彩色背景填充，而是：
 * - 顶部 2px 粗线 + 平台色小色块
 * - 大号衬线标题
 * - 干净的白底内容区
 * - ScrollReveal 滚动触发入场动画
 */
export function SectionShell({
  id,
  colorVar,
  title,
  pill,
  children,
  className,
}: {
  id?: string;
  colorVar: string;
  title: string;
  pill?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal data-section-id={id} className={`section-divider${className ? ` ${className}` : ""}`} animateClass="animate-reveal">
      {/* 零高度锚点 — 跳转直达标题，绕过 section padding/margin */}
      {id && <div id={id} className="scroll-anchor" />}

      {/* Section 头部 */}
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            {title}
          </h2>
        </div>
        {pill ? <span className="shrink-0">{pill}</span> : null}
      </div>

      {/* 2px 平台色标记线 */}
      <div
        className="w-12 h-0.5 mb-8"
        style={{ background: `var(${colorVar})` }}
      />

      {/* 内容 */}
      <div>{children}</div>
    </ScrollReveal>
  );
}

/**
 * 排名徽章 — 报纸印刷风
 * #1 = 实心深底白字
 * #2 = 深灰底白字
 * #3 = 描边
 * 其余 = 纯数字
 */
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <span className="rank-badge rank-badge-gold">1</span>;
  }
  if (rank === 2) {
    return <span className="rank-badge rank-badge-silver">2</span>;
  }
  if (rank === 3) {
    return <span className="rank-badge rank-badge-bronze">3</span>;
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-semibold tabular-nums text-text-muted font-mono">
      {rank}
    </span>
  );
}
