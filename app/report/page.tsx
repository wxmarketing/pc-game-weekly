import { getLatestBrowserShare, getLatestPcShipmentsQuarterly, getLatestSearchEngineShare } from "@/lib/report/staticSeries";
import {
  attachSteamAppBriefToMonthlyNew,
  attachSteamAppBriefToUpcoming,
  attachSteamAppBriefToWeeklyReport,
  load4399SummaryFromSupabase,
  load4399NewGamesSummaryFromSupabase,
  loadEpicFreeGamesFromSupabase,
  loadEpicMostPlayedFromSupabase,
  loadEpicTopSellersFromSupabase,
  loadSteamMonthlyTopNewFromSupabase,
  loadSteamUpdatesSummaryFromSupabase,
  loadSteamUpcomingPopularFromSupabase,
  loadSteamWeeklyTopsellersFromSupabase,
  loadTapTapTableFromSupabase,
  loadWeGameTableFromSupabase,
  loadNewsDigestFromSupabase,
} from "@/lib/report/supabaseReportData";
import { fetchSteamAppsBrief, type SteamAppBrief } from "@/lib/steam/appDetails";
import { SharePie } from "./SharePie";
import { SectionShell, RankBadge } from "./ui";
import { WeGameSection } from "./WeGameSection";
import { PlatformNav } from "./PlatformNav";
import { ExpandableList } from "./ExpandableList";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/* ============================================
   工具函数
   ============================================ */
function sharesRecordToArray(shares: Record<string, number> | null | undefined) {
  return Object.entries(shares || {}).map(([name, value]) => ({ name, value: Number(value) }));
}

function extractWeekPill(label: string | null | undefined): string | null {
  const s = (label || "").trim();
  if (!s) return null;
  const m1 = s.match(/(\d{4})\s*[-/.\s]?\s*W(\d{1,2})/i);
  if (m1) return `${m1[1]} W${String(m1[2]).padStart(2, "0")}`;
  const m2 = s.match(/(\d{4}).*第\s*(\d{1,2})\s*周/);
  if (m2) return `${m2[1]} W${String(m2[2]).padStart(2, "0")}`;
  return null;
}

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

function formatMoney(amount: number, currency: string | null | undefined): string {
  const c = (currency || "").trim().toUpperCase();
  const symbol = c === "CNY" ? "¥" : c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : null;
  const fixed = Number.isFinite(amount) ? amount.toFixed(2).replace(/\.00$/, "") : String(amount);
  return symbol ? `${symbol}${fixed}` : c ? `${fixed} ${c}` : fixed;
}

function isFreeText(input: unknown): boolean {
  const s = String(input ?? "").trim();
  if (!s) return false;
  const n = s.replace(/\s+/g, "").replace(/[（()）]/g, "");
  return n === "免费" || n === "免费下载" || n.includes("免费");
}

function normalizeCoverUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  const m = raw.match(/^(https?:\/\/.+?\.(?:png|jpe?g|webp|gif))(?:[/?#].*)?$/i);
  if (m) return m[1]!;
  return raw;
}

/* ============================================
   UI 原子组件
   ============================================ */

/** 排名变化箭头 */
function Arrow({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold tabular-nums"
        style={{ color: "var(--color-rise)" }}>
        +{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold tabular-nums"
        style={{ color: "var(--color-drop)" }}>
        {delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums text-text-muted">
      —
    </span>
  );
}

/** 免费标签 — 统一 icon 样式，不接受自定义文案 */
function FreePill() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold tracking-wide"
      style={{
        background: "var(--color-free-soft)",
        color: "var(--color-free)",
        border: "1px solid var(--color-free-border)",
        borderRadius: "2px",
      }}>
      免费
    </span>
  );
}

/** 折扣标签 */
function DiscountTag({ percent }: { percent: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
      style={{
        background: "var(--color-discount-soft)",
        color: "var(--color-discount)",
        border: "1px solid var(--color-discount-border)",
        borderRadius: "2px",
      }}>
      -{percent}%
    </span>
  );
}

/** 新上榜标签 */
function NewTag() {
  return (
    <span className="inline-flex items-center px-1 py-px text-[9px] font-bold tracking-wider uppercase leading-none"
      style={{
        background: "var(--color-new-soft)",
        color: "var(--color-new)",
        border: "1px solid var(--color-new-border)",
        borderRadius: "2px",
      }}>
      NEW
    </span>
  );
}

/** 外部链接 */
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
    <a
      className={className}
      href={u}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

/** 
 * 榜单行 — 编辑排版风格
 * 用底部细线分隔，不用卡片
 */
function ChartRow({
  rank,
  rankDelta,
  coverUrl,
  title,
  titleHref,
  titleExtra,
  subtitle,
  priceMain,
  priceExtra,
  staggerIndex,
  compact,
}: {
  rank: number;
  rankDelta?: number | null;
  coverUrl?: string | null;
  title: string;
  titleHref?: string | null;
  titleExtra?: ReactNode;
  subtitle: string;
  priceMain: ReactNode;
  priceExtra?: ReactNode;
  staggerIndex?: number;
  /** compact 模式：用于双栏并列时，缩小封面和价格列宽 */
  compact?: boolean;
}) {
  const cover = normalizeCoverUrl(coverUrl);

  return (
    <div
      className={`grid items-center py-3 border-b border-border-light row-hover group animate-row-in ${
        compact
          ? "grid-cols-[1.5rem_36px_1fr_auto] gap-2"
          : "grid-cols-[1.75rem_40px_1fr_auto] sm:grid-cols-[1.75rem_48px_1fr_5.5rem] gap-3 sm:gap-4 sm:py-3.5"
      }`}
      style={{ "--stagger": staggerIndex ?? 0 } as React.CSSProperties}
    >
      {/* 排名 */}
      <div className="flex justify-center">
        <RankBadge rank={rank} />
      </div>

      {/* 封面 */}
      <div
        className={`overflow-hidden bg-bg-surface ${
          compact ? "h-9 w-9" : "h-10 w-10 sm:h-12 sm:w-12"
        }`}
        style={{ borderRadius: "2px" }}
      >
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="h-full w-full object-cover cover-zoom"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">—</div>
        )}
      </div>

      {/* 标题 */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <ExternalLink
            href={titleHref}
            className={`truncate font-medium text-text-primary hover:text-text-accent transition-colors duration-150 ${
              compact ? "text-[13px]" : "text-sm"
            }`}
          >
            {title}
          </ExternalLink>
          <span className="shrink-0 flex items-center gap-1">
            {titleExtra}
            {typeof rankDelta === "number" ? <Arrow delta={rankDelta} /> : null}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>
      </div>

      {/* 价格 */}
      <div className="text-right tabular-nums whitespace-nowrap pl-2">
        <div className={`font-medium text-text-primary ${compact ? "text-[13px]" : "text-sm"}`}>{priceMain}</div>
        {priceExtra ? <div className="mt-1 flex justify-end">{priceExtra}</div> : null}
      </div>
    </div>
  );
}


/* ============================================
   主页面
   ============================================ */
export default async function ReportPage() {
  /* ---------- 数据获取（不变） ---------- */
  let browserShare: Awaited<ReturnType<typeof getLatestBrowserShare>> = null;
  let pcShipments: Awaited<ReturnType<typeof getLatestPcShipmentsQuarterly>> = null;
  let searchShare: Awaited<ReturnType<typeof getLatestSearchEngineShare>> = null;
  try {
    [browserShare, pcShipments, searchShare] = await Promise.all([
      getLatestBrowserShare(),
      getLatestPcShipmentsQuarterly(),
      getLatestSearchEngineShare(),
    ]);
  } catch { /* 兜底 */ }

  const [
    steamWeekly, steamUpcoming, steamMonthlyNew, steamUpdatesSummary,
    summary4399, summary4399New,
    epicTop, epicMostPlayed, epicFree,
    wgBestseller, wgPurchase, wgFollow,
    tapHot, tapTest,
    newsDigest,
  ] = await Promise.all([
    loadSteamWeeklyTopsellersFromSupabase(),
    loadSteamUpcomingPopularFromSupabase(),
    loadSteamMonthlyTopNewFromSupabase(),
    loadSteamUpdatesSummaryFromSupabase(),
    load4399SummaryFromSupabase(),
    load4399NewGamesSummaryFromSupabase(),
    loadEpicTopSellersFromSupabase(),
    loadEpicMostPlayedFromSupabase(),
    loadEpicFreeGamesFromSupabase(),
    loadWeGameTableFromSupabase("wegame_bestseller"),
    loadWeGameTableFromSupabase("wegame_purchase"),
    loadWeGameTableFromSupabase("wegame_follow"),
    loadTapTapTableFromSupabase("taptap_hot_download"),
    loadTapTapTableFromSupabase("taptap_test_hot"),
    loadNewsDigestFromSupabase(),
  ]);

  const steamAppIds = new Set<number>();
  for (const it of steamWeekly?.items ?? []) if (it.appid && it.appid > 0) steamAppIds.add(it.appid);
  for (const it of steamUpcoming?.items ?? []) if (it.appid && it.appid > 0) steamAppIds.add(it.appid);
  for (const it of steamMonthlyNew?.items ?? []) if (it.appid && it.appid > 0) steamAppIds.add(it.appid);

  let steamBriefMap = new Map<number, SteamAppBrief>();
  if (steamAppIds.size > 0) {
    try { steamBriefMap = await fetchSteamAppsBrief([...steamAppIds], { cc: "CN", l: "schinese" }); } catch { /* fallback */ }
  }

  const steamWeeklyEnriched = steamWeekly ? attachSteamAppBriefToWeeklyReport(steamWeekly, steamBriefMap) : null;
  const steamUpcomingEnriched = steamUpcoming ? attachSteamAppBriefToUpcoming(steamUpcoming, steamBriefMap) : null;
  const steamMonthlyNewEnriched = steamMonthlyNew ? attachSteamAppBriefToMonthlyNew(steamMonthlyNew, steamBriefMap) : null;

  const epicCharts = epicTop || epicMostPlayed ? {
    meta: { fetchDate: epicTop?.fetchDate ?? epicMostPlayed?.fetchDate ?? null },
    topSellers: epicTop?.games ?? [],
    mostPlayed: epicMostPlayed?.games ?? [],
  } : null;

  /* ---------- 国内 PC 保有量 ---------- */
  const estPcInUse = (() => {
    const households = 548_557_000;
    const computersPer100 = 44.8;
    const value = households * (computersPer100 / 100);
    return { year: 2024, households, computersPer100, value };
  })();
  const estPcInUseYi = (estPcInUse.value / 1e8).toFixed(2);

  const shipmentsLabelMap = { Lenovo: "联想", Huawei: "华为", HP: "惠普", iSoftStone: "软通动力", Asus: "华硕", Others: "其他" } as Record<string, string>;
  const shipmentsPeriodLabel = pcShipments
    ? (() => { const d = new Date(pcShipments.quarter); if (!Number.isFinite(d.getTime())) return pcShipments.quarter; const q = Math.floor(d.getMonth() / 3) + 1; return `${d.getFullYear()}年Q${q}`; })()
    : "未录入";

  const browserMonthLabel = browserShare
    ? (() => { const d = new Date(browserShare.month); if (!Number.isFinite(d.getTime())) return browserShare.month; return `${d.getFullYear()}年${d.getMonth() + 1}月`; })()
    : "未录入";

  const searchEngineLabelMap = { bing: "必应", Baidu: "百度", Haosou: "好搜", YANDEX: "Yandex", Google: "Google", Sogou: "搜狗" } as Record<string, string>;
  const searchMonthLabel = searchShare
    ? (() => { const d = new Date(searchShare.month); if (!Number.isFinite(d.getTime())) return searchShare.month; return `${d.getFullYear()}年${d.getMonth() + 1}月`; })()
    : "未录入";

  const reportLabel = steamWeeklyEnriched?.meta.label ?? null;
  const weekPill = extractWeekPill(reportLabel);

  // 从 Steam 表最新 batch 的 fetchDate 提取更新日期
  const dataUpdateDate = (() => {
    const raw = steamWeeklyEnriched?.meta.fetchDate ?? null;
    if (!raw) return null;
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return null;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="min-h-dvh">
      {/* Sticky 平台导航 — 独立于内容流 */}
      <PlatformNav />

      <main className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 pt-4 pb-12 sm:pt-6 sm:pb-16">

        {/* ========================================================
            报头 — 杂志封面式
            ======================================================== */}
        <header className="animate-reveal" style={{ animationFillMode: "backwards" }}>
          {/* 顶部粗线 */}
          <div className="rule-heavy mb-6" />

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-8">
            <div className="min-w-0">
              {/* 大标题 — 衬线体，戏剧性 */}
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary leading-none">
                PC 游戏
                <br />
                <span className="font-editorial text-text-accent">行业周报</span>
              </h1>
              <p className="mt-4 text-sm text-text-muted max-w-md leading-relaxed">
                {reportLabel || "聚合 Steam · Epic · WeGame · TapTap · 4399 五大平台数据"}
              </p>
            </div>

            {/* 右侧：更新日期 & 周次标记 */}
            {(weekPill || dataUpdateDate) && (
              <div className="shrink-0 text-right sm:text-right flex flex-col items-end gap-1.5">
                {weekPill && (
                  <div className="font-mono text-3xl sm:text-4xl font-bold tabular-nums text-text-primary tracking-tighter">
                    {weekPill}
                  </div>
                )}
                {dataUpdateDate && (
                  <div className="header-update-date">
                    <span className="header-update-date-label">更新时间：</span>
                    <span className="header-update-date-value">{dataUpdateDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 细双线收尾 */}
          <div className="rule-double mt-6" />
        </header>

        {/* ========================================================
            每周新闻 — 核心要点速览
            ======================================================== */}
        <SectionShell id="section-news" colorVar="--color-news" title="每周新闻" className="!mt-4 !pt-4"
          pill={<span className="font-mono text-xs text-text-muted tabular-nums">{weekPill}</span>}
        >
          {newsDigest && newsDigest.categories.length > 0 ? (
            <div>
              {newsDigest.categories.map((cat, catIdx) => (
                <div
                  key={cat.category}
                  className="news-category animate-row-in"
                  style={{ "--stagger": catIdx } as React.CSSProperties}
                >
                  {/* 分类标题 */}
                  <div className="news-category-title">
                    <span className="news-category-dot" />
                    {cat.category}
                  </div>
                  {/* 新闻条目 */}
                  <div>
                    {cat.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="news-item animate-row-in"
                        style={{ "--stagger": catIdx * 4 + idx + 1 } as React.CSSProperties}
                      >
                        <span
                          className="news-item-summary"
                          dangerouslySetInnerHTML={{
                            __html: item.summary
                              .replace(/</g, "&lt;")
                              .replace(/>/g, "&gt;")
                              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                          }}
                        />
                        {item.sourceLink ? (
                          <div>
                            <a
                              href={item.sourceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="news-source-link"
                            >
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
                                <path d="M9.5 2.5h4v4" />
                                <path d="M13.5 2.5 7.5 8.5" />
                              </svg>
                              {item.sourceTitle || "来源"}
                            </a>
                          </div>
                        ) : item.sourceTitle ? (
                          <span className="news-source-text">— {item.sourceTitle}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* 底部备注 */}
              <div className="news-footer">新闻摘要来源于公开资讯，仅供参考</div>
            </div>
          ) : (
            <div className="py-6 text-sm text-text-muted text-center">暂无本周新闻数据</div>
          )}
        </SectionShell>

        {/* ========================================================
            行业大盘 — 2×2 等宽网格
            ======================================================== */}
        <SectionShell id="section-overview" colorVar="--color-accent" title="行业大盘" className="!mt-4 !pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-light border border-border-light">
            {/* ① 国内 PC 保有量 */}
            <div className="bg-bg-base p-6 sm:p-8 flex flex-col justify-center min-h-[260px]">
              <div className="editorial-label mb-3">国内 PC 保有量</div>
              <div className="hero-number text-5xl tabular-nums animate-count-up" style={{ animationDelay: "0.1s", animationFillMode: "backwards" }}>
                {estPcInUseYi}
                <span className="text-xl font-normal text-text-secondary ml-1" style={{ fontFamily: "var(--font-body)" }}>亿台</span>
              </div>
              <div className="mt-2 text-xs text-text-muted">{estPcInUse.year} 年末估算</div>

              <details className="mt-4 group">
                <summary className="cursor-pointer text-xs text-text-muted hover:text-text-secondary transition-colors inline-flex items-center gap-1">
                  <span className="border-b border-dashed border-current">推算方法</span>
                </summary>
                <div className="mt-2 pl-0 text-xs text-text-muted space-y-1 leading-relaxed">
                  <div>家庭户数 × (每百户计算机 / 100)</div>
                  <div>{(estPcInUse.households / 1e6).toFixed(1)}M 户 × ({estPcInUse.computersPer100}/100) ≈ {estPcInUseYi} 亿台</div>
                  <div className="text-text-muted/70 pt-1">
                    来源：
                    <a href="https://www.stats.gov.cn/sj/ndsj/2025/html/C02-09.jpg" target="_blank" rel="noreferrer" className="text-text-accent hover:underline">C02-09</a>
                    {" · "}
                    <a href="https://www.stats.gov.cn/sj/ndsj/2025/html/C06-05.jpg" target="_blank" rel="noreferrer" className="text-text-accent hover:underline">C06-05</a>
                    （统计年鉴 2025）
                  </div>
                </div>
              </details>
            </div>

            {/* ② PC 出货量份额 */}
            <div className="bg-bg-base p-6 sm:p-8 min-h-[260px]">
              <SharePie
                title="PC 出货量份额"
                subtitle={`${shipmentsPeriodLabel} · 总量 ${pcShipments ? Number(pcShipments.total_million_units).toLocaleString() : "—"}M`}
                data={sharesRecordToArray(pcShipments?.shares)}
                labelMap={shipmentsLabelMap}
                source={pcShipments?.source ? `来源：${pcShipments.note ?? pcShipments.source}` : undefined}
              />
            </div>

            {/* ③ PC 搜索引擎份额 */}
            <div className="bg-bg-base p-6 sm:p-8 min-h-[260px]">
              <SharePie
                title="PC 搜索引擎份额"
                subtitle={searchMonthLabel}
                data={sharesRecordToArray(searchShare?.shares)}
                labelMap={searchEngineLabelMap}
                source={searchShare?.source ? `来源：${searchShare.note ?? searchShare.source}` : undefined}
              />
            </div>

            {/* ④ PC 浏览器份额 */}
            <div className="bg-bg-base p-6 sm:p-8 min-h-[260px]">
              <SharePie
                title="PC 浏览器份额"
                subtitle={browserMonthLabel}
                data={sharesRecordToArray(browserShare?.shares || {})}
                labelMap={{ Chrome: "Chrome", Edge: "Edge", "360 Safe": "360浏览器", Safari: "Safari", "QQ Browser": "QQ浏览器", Firefox: "火狐" }}
                source={browserShare?.source ? `来源：${browserShare.source}` : undefined}
              />
            </div>
          </div>
        </SectionShell>

        {/* ========================================================
            Steam — 一级分类
            ======================================================== */}
        <SectionShell
          id="section-steam"
          colorVar="--color-steam"
          title="Steam"
          pill={<span className="font-mono text-xs text-text-muted tabular-nums">{weekPill}</span>}
        >
          <div className="space-y-10">

            {/* ── 每周畅销榜 ── */}
            <div>
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary">每周畅销榜</h3>
                <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(steamWeeklyEnriched?.meta.fetchDate)}</span>
              </div>
              {steamWeeklyEnriched ? (
                <div className="space-y-10">
                  {/* 主榜 */}
                  <div>
                    <div className="editorial-label mb-4">主榜 Top 20</div>
                    <div className="border-t-2 border-border-rule">
                      <ExpandableList limit={5}>
                        {steamWeeklyEnriched.items.slice(0, 20).map((it, idx) => {
                          const subtitle = [
                            it.genres.length ? it.genres.join(" · ") : "类型未知",
                            typeof it.weeksOnChart === "number" ? `在榜 ${it.weeksOnChart} 周` : null,
                          ].filter(Boolean).join(" · ");

                          return (
                            <ChartRow
                              key={`${it.rank}-${it.name ?? it.appid ?? ""}`}
                              rank={it.rank}
                              rankDelta={it.rankDelta}
                              coverUrl={it.headerImage}
                              title={it.name || (it.appid ? `App ${it.appid}` : "—")}
                              titleHref={it.appid ? `https://store.steampowered.com/app/${it.appid}/` : null}
                              titleExtra={it.weeksOnChart === 1 ? <NewTag /> : undefined}
                              subtitle={subtitle}
                              staggerIndex={idx}
                              priceMain={isFreeText(it.priceText) ? <FreePill /> : (it.priceText || "—")}
                              priceExtra={
                                typeof it.discountPercent === "number" && it.discountPercent > 0
                                  ? <DiscountTag percent={it.discountPercent} />
                                  : undefined
                              }
                            />
                          );
                        })}
                      </ExpandableList>
                    </div>
                  </div>

                  {/* 涨跌 — 并列两栏 */}
                  <div className="grid gap-6 sm:gap-10 sm:grid-cols-2 items-start">
                    {/* 上升 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-1.5 h-1.5" style={{ background: "var(--color-rise)", borderRadius: "1px" }} />
                        <span className="editorial-label" style={{ color: "var(--color-rise)" }}>本周上升最多</span>
                      </div>
                      <div className="border-t border-border">
                        {steamWeeklyEnriched.moversUp.length === 0 ? (
                          <div className="py-6 text-sm text-text-muted text-center">暂无</div>
                        ) : (
                          <ExpandableList limit={5}>
                            {steamWeeklyEnriched.moversUp.map((it, idx) => (
                              <ChartRow
                                key={`up-${it.appid ?? it.rank}`}
                                rank={it.rank}
                                rankDelta={it.rankDelta}
                                coverUrl={it.headerImage}
                                title={it.name || (it.appid ? `App ${it.appid}` : "—")}
                                titleHref={it.appid ? `https://store.steampowered.com/app/${it.appid}/` : null}
                                subtitle={[
                                  it.genres.length ? it.genres.join(" · ") : "类型未知",
                                  typeof it.weeksOnChart === "number" ? `在榜 ${it.weeksOnChart} 周` : null,
                                ].filter(Boolean).join(" · ")}
                                staggerIndex={idx}
                                priceMain={isFreeText(it.priceText) ? <FreePill /> : (it.priceText || "—")}
                                priceExtra={
                                  typeof it.discountPercent === "number" && it.discountPercent > 0
                                    ? <DiscountTag percent={it.discountPercent} />
                                    : undefined
                                }
                                compact
                              />
                            ))}
                          </ExpandableList>
                        )}
                      </div>
                    </div>

                    {/* 本周新上榜 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-1.5 h-1.5" style={{ background: "var(--color-new)", borderRadius: "1px" }} />
                        <span className="editorial-label" style={{ color: "var(--color-new)" }}>本周新上榜</span>
                      </div>
                      <div className="border-t border-border">
                        {steamWeeklyEnriched.newOnChart.length === 0 ? (
                          <div className="py-6 text-sm text-text-muted text-center">本周暂无新上榜游戏</div>
                        ) : (
                          <ExpandableList limit={5}>
                            {steamWeeklyEnriched.newOnChart.map((it, idx) => (
                              <ChartRow
                                key={`new-${it.appid ?? it.rank}`}
                                rank={it.rank}
                                rankDelta={it.rankDelta}
                                coverUrl={it.headerImage}
                                title={it.name || (it.appid ? `App ${it.appid}` : "—")}
                                titleHref={it.appid ? `https://store.steampowered.com/app/${it.appid}/` : null}
                                titleExtra={<NewTag />}
                                subtitle={[
                                  it.genres.length ? it.genres.join(" · ") : "类型未知",
                                  typeof it.weeksOnChart === "number" ? `在榜 ${it.weeksOnChart} 周` : null,
                                ].filter(Boolean).join(" · ")}
                                staggerIndex={idx}
                                priceMain={isFreeText(it.priceText) ? <FreePill /> : (it.priceText || "—")}
                                priceExtra={
                                  typeof it.discountPercent === "number" && it.discountPercent > 0
                                    ? <DiscountTag percent={it.discountPercent} />
                                    : undefined
                                }
                                compact
                              />
                            ))}
                          </ExpandableList>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-text-muted">暂无数据</div>
              )}
            </div>

            {/* ── 平台动态 ── */}
            <div>
              <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary mb-6">平台动态</h3>
              {steamUpdatesSummary ? (
                <div className="max-w-3xl">
                  {steamUpdatesSummary.title ? (
                    <h4 className="text-base font-medium text-text-primary mb-1">{steamUpdatesSummary.title}</h4>
                  ) : null}
                  {steamUpdatesSummary.updatedAt ? (
                    <p className="text-xs text-text-muted mb-4">更新：{dateOnlyLabel(steamUpdatesSummary.updatedAt)}</p>
                  ) : null}
                  <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                    {steamUpdatesSummary.body}
                  </p>
                  {steamUpdatesSummary.extra ? (
                    <a
                      href={steamUpdatesSummary.extra}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-accent mt-4 hover:underline"
                    >
                      查看详情 <span className="link-arrow">→</span>
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-text-muted">暂无数据</div>
              )}
            </div>

            {/* ── 即将推出 ── */}
            <div>
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary">即将推出</h3>
                <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(steamUpcomingEnriched?.fetchDate)}</span>
              </div>
              {steamUpcomingEnriched?.items?.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border-light border border-border-light">
                  {steamUpcomingEnriched.items.slice(0, 18).map((it, idx) => (
                    <div
                      key={`${it.rank}-${it.name}`}
                      className="flex gap-3 p-4 bg-bg-base group animate-card-in"
                      style={{ "--stagger": idx } as React.CSSProperties}
                    >
                      <div className="w-14 h-14 flex-shrink-0 overflow-hidden bg-bg-surface" style={{ borderRadius: "2px" }}>
                        {it.headerImage ? (
                          <img
                            src={it.headerImage}
                            alt={it.name}
                            className="object-cover w-full h-full cover-zoom"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <ExternalLink
                          href={it.appid ? `https://store.steampowered.com/app/${it.appid}/` : null}
                          className="text-sm font-medium text-text-primary truncate block hover:text-text-accent transition-colors"
                        >
                          {it.name}
                        </ExternalLink>
                        {it.genres.length > 0 ? (
                          <div className="flex gap-1 mt-0.5 overflow-hidden">
                            {it.genres.slice(0, 3).map((t) => (
                              <span key={t} className="inline-block px-1.5 py-px text-[10px] leading-tight rounded bg-bg-surface text-text-muted truncate max-w-[80px]">{t}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
                          <span>{it.releaseDateText || "日期待定"}</span>
                          {typeof it.followers === "number" ? (
                            <span className="font-mono tabular-nums">{(it.followers / 1000).toFixed(1)}K 关注</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* 奇数项时补一个空白格，避免灰色背景露出 */}
                  {steamUpcomingEnriched.items.slice(0, 18).length % 2 !== 0 && (
                    <div className="hidden sm:block bg-bg-base" />
                  )}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-text-muted">暂无数据</div>
              )}
            </div>

            {/* ── 月度新品 ── */}
            <div>
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary">月度新品</h3>
                <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(steamMonthlyNewEnriched?.fetchDate)}</span>
              </div>
              {steamMonthlyNewEnriched?.items?.length ? (
                <div className="grid gap-8 sm:grid-cols-2">
                  {(["gold", "silver"] as const)
                    .filter((tier) => steamMonthlyNewEnriched.items.some((x) => x.tier === tier))
                    .map((tier) => {
                      const label = tier === "gold" ? "黄金级" : "白银级";
                      const list = steamMonthlyNewEnriched.items.filter((x) => x.tier === tier);
                      return (
                        <div key={tier}>
                          <div className="editorial-label mb-4">{label}</div>
                          <div className="border-t-2 border-border-rule">
                            <ExpandableList limit={5}>
                            {list.slice(0, 12).map((it, idx) => (
                              <ChartRow
                                key={`${tier}-${it.name}`}
                                rank={idx + 1}
                                coverUrl={it.headerImage}
                                title={it.name}
                                titleHref={it.appid ? `https://store.steampowered.com/app/${it.appid}/` : null}
                                subtitle={it.genres.length ? it.genres.join(" · ") : "类型未知"}
                                staggerIndex={idx}
                                priceMain={isFreeText(it.priceText) ? <FreePill /> : (it.priceText || "—")}
                                priceExtra={
                                  typeof it.discountPercent === "number" && it.discountPercent > 0
                                    ? <DiscountTag percent={it.discountPercent} />
                                    : undefined
                                }
                              />
                            ))}
                            </ExpandableList>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-text-muted">暂无数据</div>
              )}
            </div>

          </div>
        </SectionShell>

        {/* ========================================================
            Epic Games Store
            ======================================================== */}
        <SectionShell id="section-epic" colorVar="--color-epic" title="Epic Games Store">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* 最畅销 */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <span className="editorial-label">最畅销</span>
                <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(epicTop?.fetchDate)}</span>
              </div>
              <div className="border-t-2 border-border-rule">
                {epicCharts?.topSellers?.length ? (
                  <ExpandableList limit={5}>
                  {epicCharts.topSellers.slice(0, 10).map((g, idx) => {
                    const subtitle = g.tags.length ? g.tags.slice(0, 3).join(" · ") : "—";
                    const hasDiscount = typeof g.discount_percent === "number" && g.discount_percent > 0 && g.current_price_num != null;
                    const current = g.current_price_num != null ? formatMoney(g.current_price_num, g.currency) : g.current_price_usd != null ? formatMoney(g.current_price_usd, "USD") : null;
                    const original = g.original_price_num != null ? formatMoney(g.original_price_num, g.currency) : g.original_price_usd != null ? formatMoney(g.original_price_usd, "USD") : null;

                    const priceMain = g.is_free === true
                      ? <FreePill />
                      : hasDiscount && current && original
                        ? (<div className="flex items-center justify-end gap-1.5">
                            <span className="text-xs text-text-muted line-through tabular-nums">{original}</span>
                            <span className="text-sm font-medium text-text-primary tabular-nums">{current}</span>
                          </div>)
                        : current ?? "—";

                    return (
                      <ChartRow
                        key={`epic-top-${g.rank}`}
                        rank={g.rank}
                        coverUrl={g.cover_image}
                        title={g.name}
                        titleHref={g.epic_store_url}
                        subtitle={subtitle}
                        staggerIndex={idx}
                        priceMain={priceMain}
                        priceExtra={hasDiscount ? <DiscountTag percent={g.discount_percent!} /> : undefined}
                      />
                    );
                  })}
                  </ExpandableList>
                ) : (
                  <div className="py-6 text-sm text-text-muted text-center">暂无数据</div>
                )}
              </div>
            </div>

            {/* 最多人游玩 */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <span className="editorial-label">最多人游玩</span>
                <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(epicMostPlayed?.fetchDate)}</span>
              </div>
              <div className="border-t-2 border-border-rule">
                {epicCharts?.mostPlayed?.length ? (
                  <ExpandableList limit={5}>
                  {epicCharts.mostPlayed.slice(0, 10).map((g, idx) => {
                    const subtitle = g.tags.length ? g.tags.slice(0, 3).join(" · ") : "—";
                    const isFree = g.is_free === true;
                    const hasDiscount = typeof g.discount_percent === "number" && g.discount_percent > 0 && g.current_price_num != null;
                    const current = g.current_price_num != null ? formatMoney(g.current_price_num, g.currency) : g.current_price_usd != null ? formatMoney(g.current_price_usd, "USD") : null;
                    const original = g.original_price_num != null ? formatMoney(g.original_price_num, g.currency) : g.original_price_usd != null ? formatMoney(g.original_price_usd, "USD") : null;

                    const priceMain = isFree
                      ? <FreePill />
                      : hasDiscount && current && original
                        ? (<div className="flex items-center justify-end gap-1.5">
                            <span className="text-xs text-text-muted line-through tabular-nums">{original}</span>
                            <span className="text-sm font-medium text-text-primary tabular-nums">{current}</span>
                          </div>)
                        : current ?? "—";

                    return (
                      <ChartRow
                        key={`epic-mp-${g.rank}`}
                        rank={g.rank}
                        coverUrl={g.cover_image}
                        title={g.name}
                        titleHref={g.epic_store_url}
                        subtitle={subtitle}
                        staggerIndex={idx}
                        priceMain={priceMain}
                        priceExtra={hasDiscount ? <DiscountTag percent={g.discount_percent!} /> : undefined}
                      />
                    );
                  })}
                  </ExpandableList>
                ) : (
                  <div className="py-6 text-sm text-text-muted text-center">暂无数据</div>
                )}
              </div>
            </div>
          </div>

          {/* 免费游戏 — 卡片网格 */}
          <div className="mt-10">
            <div className="flex items-baseline justify-between mb-6">
              <h3 className="font-display text-lg sm:text-xl font-bold text-text-primary">本周免费游戏</h3>
              <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(epicFree?.fetchDate ?? null)}</span>
            </div>
            {epicFree?.games?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border-light border border-border-light">
                {epicFree.games.slice(0, 20).map((g, idx) => {
                  const dateText = g.startAt && g.endAt
                    ? `${dateOnlyLabel(g.startAt)} 至 ${dateOnlyLabel(g.endAt)}`
                    : g.startAt
                      ? `${dateOnlyLabel(g.startAt)} 起`
                      : g.endAt
                        ? `截止 ${dateOnlyLabel(g.endAt)}`
                        : null;
                  return (
                    <div
                      key={`epic-free-${g.rank}-${g.name}`}
                      className="flex items-start gap-3 p-4 bg-bg-base group animate-card-in"
                      style={{ "--stagger": idx } as React.CSSProperties}
                    >
                      <div className="w-14 h-14 flex-shrink-0 overflow-hidden bg-bg-surface" style={{ borderRadius: "2px" }}>
                        {g.cover_image ? (
                          <img
                            src={normalizeCoverUrl(g.cover_image) ?? undefined}
                            alt={g.name}
                            className="object-cover w-full h-full cover-zoom"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <ExternalLink
                          href={g.epic_store_url}
                          className="text-sm font-medium text-text-primary truncate block hover:text-text-accent transition-colors"
                        >
                          {g.name}
                        </ExternalLink>
                        {g.tags.length > 0 ? (
                          <div className="flex gap-1 mt-0.5 overflow-hidden">
                            {g.tags.slice(0, 3).map((t) => (
                              <span key={t} className="inline-block px-1.5 py-px text-[10px] leading-tight rounded bg-bg-surface text-text-muted truncate max-w-[80px]">{t}</span>
                            ))}
                          </div>
                        ) : null}
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {dateText || "—"}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {/* 不满3列时补空白格，避免灰色背景露出 */}
                {(() => {
                  const remainder = epicFree.games.slice(0, 20).length % 3;
                  if (remainder === 0) return null;
                  const fillers = 3 - remainder;
                  return Array.from({ length: fillers }, (_, i) => (
                    <div key={`epic-free-filler-${i}`} className="hidden sm:block bg-bg-base" />
                  ));
                })()}
              </div>
            ) : (
              <div className="py-6 text-sm text-text-muted text-center">暂无数据</div>
            )}
          </div>
        </SectionShell>

        {/* ========================================================
            WeGame
            ======================================================== */}
        <WeGameSection bestseller={wgBestseller} purchase={wgPurchase} follow={wgFollow} />

        {/* ========================================================
            TapTap
            ======================================================== */}
        <SectionShell id="section-taptap" colorVar="--color-taptap" title="TapTap（PC）">
          <div className="grid gap-8 lg:grid-cols-2">
            {[
              { title: "热门下载", key: "hot", pack: tapHot },
              { title: "测试热度", key: "test", pack: tapTest },
            ].map((x) => (
              <div key={x.key}>
                <div className="flex items-baseline justify-between mb-4">
                  <span className="editorial-label">{x.title}</span>
                  <span className="text-xs text-text-muted font-mono tabular-nums">{dateOnlyLabel(x.pack?.generatedAt)}</span>
                </div>
                <div className="border-t-2 border-border-rule">
                  {x.pack?.games?.length ? (
                    <ExpandableList limit={5}>
                    {x.pack.games.slice(0, 20).map((g, idx) => {
                      const sub: string[] = [];
                      if (typeof g.rating === "number") sub.push(`${g.rating.toFixed(1)} 分`);
                      if (g.tags.length) {
                        const norm = (s: string) => s.trim().replace(/\s+/g, "").replace(/[·•・•]/g, "").replace(/[（()）]/g, "");
                        const cleanedTags = g.tags.map((t) => t.trim()).filter(Boolean).filter((t) => {
                          if (x.key !== "hot") return true;
                          if (norm(t) === "免费下载") return false;
                          if ((g.price ?? "").trim() && norm(t) === norm(g.price ?? "")) return false;
                          return true;
                        }).slice(0, 3);
                        if (cleanedTags.length) sub.push(cleanedTags.join(" · "));
                      }

                      return (
                        <ChartRow
                          key={`${x.key}-${g.rank}`}
                          rank={g.rank}
                          coverUrl={g.cover_image}
                          title={g.title}
                          titleHref={g.store_url}
                          subtitle={sub.length ? sub.join(" · ") : "—"}
                          staggerIndex={idx}
                          priceMain={
                            x.key === "test"
                              ? g.test_status ?? "—"
                              : isFreeText(g.price)
                                ? <FreePill />
                                : g.price ?? "—"
                          }
                        />
                      );
                    })}
                    </ExpandableList>
                  ) : (
                    <div className="py-6 text-sm text-text-muted text-center">暂无数据</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>

        {/* ========================================================
            4399 摘要
            ======================================================== */}
        <SectionShell id="section-4399" colorVar="--color-4399" title="4399 平台">
          {summary4399New ? (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                <div>
                  <div className="editorial-label mb-1">周期内上新统计</div>
                  <p className="text-xs text-text-muted">
                    {summary4399New.timeWindow ?? "—"}
                    {summary4399New.updatedAt ? ` · 更新 ${dateOnlyLabel(summary4399New.updatedAt)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="hero-number text-3xl tabular-nums">
                    {typeof summary4399New.totalCount === "number" ? summary4399New.totalCount.toLocaleString() : "—"}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">新上线</div>
                </div>
              </div>

              {/* 类别分布 — 水平条形 */}
              {Object.keys(summary4399New.categoryBreakdown).length ? (
                <div>
                  <div className="editorial-label mb-3">类别分布</div>
                  <div className="space-y-2">
                    {(() => {
                      const entries = Object.entries(summary4399New.categoryBreakdown)
                        .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10);
                      const total = entries.reduce((acc, [, v]) => acc + v, 0);
                      return entries.map(([k, v], idx) => {
                        const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                        return (
                          <div key={k} className="flex items-center gap-3 animate-row-in" style={{ "--stagger": idx } as React.CSSProperties}>
                            <div className="w-16 shrink-0 truncate text-xs text-text-secondary text-right" title={k}>
                              {k}
                            </div>
                            <div className="flex-1 h-4 bg-bg-surface overflow-hidden" style={{ borderRadius: "1px" }}>
                              <div
                                className="h-full animate-bar-grow"
                                style={{ width: `${pct}%`, backgroundColor: "var(--color-4399)", opacity: 0.6, "--stagger": idx } as React.CSSProperties}
                              />
                            </div>
                            <div className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-text-muted">
                              {v} <span className="text-text-muted/60">({pct}%)</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          ) : summary4399 ? (
            <div className="max-w-3xl">
              {summary4399.title ? <h3 className="text-base font-medium text-text-primary">{summary4399.title}</h3> : null}
              {summary4399.updatedAt ? (
                <p className="mt-1 text-xs text-text-muted">更新：{dateOnlyLabel(summary4399.updatedAt)}</p>
              ) : null}
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
                {summary4399.body}
              </pre>
              {summary4399.extra ? (
                <a className="mt-3 inline-flex text-xs text-text-accent hover:underline" href={summary4399.extra} target="_blank" rel="noreferrer">
                  查看详情 →
                </a>
              ) : null}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-text-muted">暂无数据</div>
          )}
        </SectionShell>

        {/* ========================================================
            页脚 — 极简编辑式
            ======================================================== */}
        <footer className="mt-12 pt-8 border-t-2 border-border-rule pb-16 animate-subtle-rise" style={{ animationDelay: "0.2s", animationFillMode: "backwards" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
            <div className="space-y-1.5">
              <p className="text-xs text-text-muted">
                数据来源：Steam · Epic Games Store · WeGame · TapTap · 4399 · 国家统计年鉴 · StatCounter
              </p>
              <p className="text-xs text-text-muted">
                生成于{" "}
                <time className="font-mono tabular-nums text-text-secondary" dateTime={new Date().toISOString()}>
                  {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                </time>
              </p>
            </div>
            <p className="text-[11px] text-text-muted/50 max-w-xs sm:text-right leading-relaxed">
              数据均来自公开渠道，仅供内部参考。榜单排名与价格以各平台实时数据为准。
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
