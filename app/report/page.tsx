import { getLatestBrowserShare, getLatestPcShipmentsQuarterly, getLatestSearchEngineShare } from "@/lib/report/staticSeries";
import {
  attachSteamAppBriefToMonthlyNew,
  attachSteamAppBriefToUpcoming,
  attachSteamAppBriefToWeeklyReport,
  load4399SummaryFromSupabase,
  loadEpicMostPlayedFromSupabase,
  loadEpicTopSellersFromSupabase,
  loadSteamMonthlyTopNewFromSupabase,
  loadSteamUpdatesSummaryFromSupabase,
  loadSteamUpcomingPopularFromSupabase,
  loadSteamWeeklyTopsellersFromSupabase,
  loadTapTapTableFromSupabase,
  loadWeGameTableFromSupabase,
} from "@/lib/report/supabaseReportData";
import { fetchSteamAppsBrief, type SteamAppBrief } from "@/lib/steam/appDetails";
import { BrowserSharePie } from "./BrowserSharePie";
import { SharePie } from "./SharePie";
import type { ReactNode } from "react";

/** 每次请求拉最新 Supabase 数据，避免静态化把空数据焊进 HTML */
export const dynamic = "force-dynamic";

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 列表元数据、摘要「更新」等文案只展示本地日历日期 */
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

function Arrow({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta > 0)
    return (
      <span className="ml-1 inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
        ↑{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="ml-1 inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
        ↓{Math.abs(delta)}
      </span>
    );
  return (
    <span className="ml-1 inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600">
      →0
    </span>
  );
}

function SteamAppLink({
  appid,
  className,
  children,
}: {
  appid: number | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  if (!appid) return <span className={className}>{children}</span>;
  return (
    <a
      className={className}
      href={`https://store.steampowered.com/app/${appid}/`}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function ExternalStoreLink({
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

function normalizeCoverUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  // TapTap 等站点偶尔会把图片后面再拼一段路径（形如 *.jpg/_tap_banner.jpg），会导致 404
  const m = raw.match(/^(https?:\/\/.+?\.(?:png|jpe?g|webp|gif))(?:[/?#].*)?$/i);
  if (m) return m[1]!;
  const m2 = raw.match(/^(https?:\/\/.+?\.(?:png|jpe?g|webp|gif))\/.+$/i);
  if (m2) return m2[1]!;
  return raw;
}

/** 与 Steam 榜单行一致的布局：排名 + 封面位 + 标题链接 + 副标题 + 右侧价格区 */
function ChartListRow({
  rank,
  coverUrl,
  title,
  titleHref,
  subtitle,
  priceMain,
  priceExtra,
}: {
  rank: number;
  coverUrl?: string | null;
  title: string;
  titleHref?: string | null;
  subtitle: string;
  priceMain: ReactNode;
  priceExtra?: ReactNode;
}) {
  const cover = normalizeCoverUrl(coverUrl);
  const thumb = cover ? (
    <img
      src={cover}
      alt={title}
      className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" aria-hidden />
  );
  const titleNode = (
    <ExternalStoreLink href={titleHref} className="truncate text-[15px] font-semibold text-zinc-900 hover:underline">
      {title}
    </ExternalStoreLink>
  );
  const priceBlock = (
    <div className="tabular-nums text-zinc-700">
      <div className="text-sm font-semibold text-zinc-900">{priceMain}</div>
      {priceExtra ? <div className="mt-1">{priceExtra}</div> : null}
    </div>
  );
  return (
    <div className="hover:bg-zinc-50/60">
      <div className="flex flex-col gap-3 px-4 py-3 sm:hidden">
        <div className="flex items-start gap-3">
          <div className="tabular-nums pt-0.5">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
              #{rank}
            </span>
          </div>
          {thumb}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">{titleNode}</div>
            <div className="mt-0.5 truncate text-[12px] text-zinc-500">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">{priceBlock}</div>
      </div>
      <div className="hidden sm:flex items-center gap-4 px-4 py-3">
        <div className="tabular-nums">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
            #{rank}
          </span>
        </div>
        {thumb}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">{titleNode}</div>
          <div className="mt-0.5 truncate text-[12px] text-zinc-500">{subtitle}</div>
        </div>
        {priceBlock}
      </div>
    </div>
  );
}

export default async function ReportPage() {
  let browserShare: Awaited<ReturnType<typeof getLatestBrowserShare>> = null;
  let pcShipments: Awaited<ReturnType<typeof getLatestPcShipmentsQuarterly>> = null;
  let searchShare: Awaited<ReturnType<typeof getLatestSearchEngineShare>> = null;
  try {
    [browserShare, pcShipments, searchShare] = await Promise.all([
      getLatestBrowserShare(),
      getLatestPcShipmentsQuarterly(),
      getLatestSearchEngineShare(),
    ]);
  } catch {
    /* 已由 staticSeries 内部兜底；此处防止 Promise.all 因未捕获的 reject 打挂整页 */
  }
  const [
    steamWeekly,
    steamUpcoming,
    steamMonthlyNew,
    steamUpdatesSummary,
    summary4399,
    epicTop,
    epicMostPlayed,
    wgBestseller,
    wgPurchase,
    wgFollow,
    tapHot,
    tapTest,
  ] = await Promise.all([
    loadSteamWeeklyTopsellersFromSupabase(),
    loadSteamUpcomingPopularFromSupabase(),
    loadSteamMonthlyTopNewFromSupabase(),
    loadSteamUpdatesSummaryFromSupabase(),
    load4399SummaryFromSupabase(),
    loadEpicTopSellersFromSupabase(),
    loadEpicMostPlayedFromSupabase(),
    loadWeGameTableFromSupabase("wegame_bestseller"),
    loadWeGameTableFromSupabase("wegame_purchase"),
    loadWeGameTableFromSupabase("wegame_follow"),
    loadTapTapTableFromSupabase("taptap_hot_download"),
    loadTapTapTableFromSupabase("taptap_test_hot"),
  ]);

  const steamAppIds = new Set<number>();
  for (const it of steamWeekly?.items ?? []) {
    if (it.appid && it.appid > 0) steamAppIds.add(it.appid);
  }
  for (const it of steamUpcoming?.items ?? []) {
    if (it.appid && it.appid > 0) steamAppIds.add(it.appid);
  }
  for (const it of steamMonthlyNew?.items ?? []) {
    if (it.appid && it.appid > 0) steamAppIds.add(it.appid);
  }
  let steamBriefMap = new Map<number, SteamAppBrief>();
  if (steamAppIds.size > 0) {
    try {
      steamBriefMap = await fetchSteamAppsBrief([...steamAppIds], { cc: "CN", l: "schinese" });
    } catch {
      /* 限流/网络失败时仅用 Supabase 兜底 */
    }
  }
  const steamWeeklyEnriched = steamWeekly ? attachSteamAppBriefToWeeklyReport(steamWeekly, steamBriefMap) : null;
  const steamUpcomingEnriched = steamUpcoming ? attachSteamAppBriefToUpcoming(steamUpcoming, steamBriefMap) : null;
  const steamMonthlyNewEnriched = steamMonthlyNew ? attachSteamAppBriefToMonthlyNew(steamMonthlyNew, steamBriefMap) : null;

  const epicCharts =
    epicTop || epicMostPlayed
      ? {
          meta: {
            fetchDate: epicTop?.fetchDate ?? epicMostPlayed?.fetchDate ?? null,
          },
          topSellers: epicTop?.games ?? [],
          mostPlayed: epicMostPlayed?.games ?? [],
        }
      : null;

  /** 与 `tryCreateSupabaseServiceClient` 一致：缺任一项则服务端不会查库，榜单会全部「暂无数据」 */
  const supabaseServerConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  // ===== 国内 PC 保有量（年）口径：按家庭户数推算（家用电脑在用量估算）=====
  // 口径：家庭户数 ×（每百户拥有计算机台数 / 100）
  // 来源：统计年鉴 2025（披露到 2024 年末）
  const estPcInUse = (() => {
    const households = 548_557_000; // 全国家庭户（户），2024年；来源 C02-09（单位：千户）
    const computersPer100 = 44.8; // 全国居民平均每百户计算机（台/百户），2024年末；来源 C06-05
    const value = households * (computersPer100 / 100);
    return { year: 2024, households, computersPer100, value };
  })();
  const estPcInUseYi = (estPcInUse.value / 1e8).toFixed(2);

  const shipmentsLabelMap = {
    Lenovo: "联想",
    Huawei: "华为",
    HP: "惠普",
    iSoftStone: "软通动力",
    Asus: "华硕",
    Others: "其他",
  } as Record<string, string>;
  const shipmentsPeriodLabel = pcShipments
    ? (() => {
        const d = new Date(pcShipments.quarter);
        if (!Number.isFinite(d.getTime())) return pcShipments.quarter;
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `${d.getFullYear()}年Q${q}`;
      })()
    : "未录入";

  const browserMonthLabel = browserShare
    ? (() => {
        const d = new Date(browserShare.month);
        if (!Number.isFinite(d.getTime())) return browserShare.month;
        return `${d.getFullYear()}年${d.getMonth() + 1}月`;
      })()
    : "未录入";

  const searchEngineLabelMap = {
    bing: "必应",
    Baidu: "百度",
    Haosou: "好搜",
    YANDEX: "Yandex",
    Google: "Google",
    Sogou: "搜狗",
  } as Record<string, string>;
  const searchMonthLabel = searchShare
    ? (() => {
        const d = new Date(searchShare.month);
        if (!Number.isFinite(d.getTime())) return searchShare.month;
        return `${d.getFullYear()}年${d.getMonth() + 1}月`;
      })()
    : "未录入";

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <main className="mx-auto max-w-6xl px-6 py-12">
        {!supabaseServerConfigured ? (
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">未连接 Supabase（服务端读库未配置）</p>
            <p className="mt-1 text-amber-900/90">
              在 <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">pc-game-weekly/.env.local</code> 填写{" "}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> 与{" "}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code>
              （Dashboard 里 <span className="whitespace-nowrap">Project Settings → API</span> 的{" "}
              <span className="font-medium">service_role</span>，不要用 anon 代替）。保存后务必重启{" "}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">npm run dev</code>。
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-zinc-600">综合周报（自动生成）</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">PC 行业周报</h1>
            {steamWeeklyEnriched ? (
              <p className="mt-3 text-sm text-zinc-600">
                数据来自 Supabase 表 <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">steam_weekly_topsellers</code>
                {steamWeeklyEnriched.meta.label ? ` · ${steamWeeklyEnriched.meta.label}` : ""}
              </p>
            ) : (
              <p className="mt-3 text-sm text-rose-700">
                暂无 Steam 每周畅销数据：请确认表中有数据，且含 rank / name（或 title）等列。
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs font-medium text-zinc-500">国内 PC 保有量（年）</div>
            <div className="group relative shrink-0">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                推算方法
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600">
                  i
                </span>
              </button>
              <div className="absolute right-0 top-7 z-10 hidden w-[320px] rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700 shadow-lg group-hover:block group-focus-within:block">
                <div className="font-semibold text-zinc-900">推算方法</div>
                <div className="mt-2 space-y-1 leading-relaxed">
                  <div>公式： 家庭户数 ×（每百户计算机 / 100）</div>
                  <div className="text-zinc-600">
                    代入：{(estPcInUse.households / 1e6).toFixed(3)} 百万户 ×（{estPcInUse.computersPer100} / 100）
                  </div>
                  <div className="text-zinc-600">
                    结果：约 {(estPcInUse.value / 1e6).toFixed(3)} 百万台（≈ {estPcInUseYi} 亿台）
                  </div>
                </div>
                <div className="mt-3 border-t border-zinc-100 pt-3 space-y-1">
                  <div className="text-zinc-500">数据源（国家统计年鉴 2025）：</div>
                  <div className="flex flex-col gap-1">
                    <a
                      className="truncate text-blue-600 hover:underline"
                      href="https://www.stats.gov.cn/sj/ndsj/2025/html/C02-09.jpg"
                      target="_blank"
                      rel="noreferrer"
                      title="C02-09 分地区户数、人口数、性别比和户规模(2024年)"
                    >
                      C02-09（家庭户数）
                    </a>
                    <a
                      className="truncate text-blue-600 hover:underline"
                      href="https://www.stats.gov.cn/sj/ndsj/2025/html/C06-05.jpg"
                      target="_blank"
                      rel="noreferrer"
                      title="C06-05 全国居民平均每百户年末主要耐用消费品拥有量"
                    >
                      C06-05（每百户计算机）
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold">{estPcInUseYi} 亿台</div>
          <div className="mt-1 text-xs text-zinc-500">数据时间：{estPcInUse.year} 年末（估算）</div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-xs font-medium text-zinc-500">国内 PC 出货量（季度）</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
              <span>
                数据时间： <span className="font-medium text-zinc-900">{shipmentsPeriodLabel}</span>
              </span>
              <span>
                总出货量：{" "}
                <span className="font-medium text-zinc-900">
                  {pcShipments ? Number(pcShipments.total_million_units).toLocaleString() : "—"}
                </span>{" "}
                百万台
              </span>
              <span>
                品牌数：{" "}
                <span className="font-medium text-zinc-900">
                  {pcShipments ? Object.keys(pcShipments.shares || {}).length : 0}
                </span>
              </span>
            </div>
            <div className="mt-5">
              {pcShipments ? (
                <SharePie
                  variant="full"
                  layout="sideBySide"
                  shares={pcShipments.shares}
                  labelMap={shipmentsLabelMap}
                  pinLast={["Others"]}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  暂无数据
                </div>
              )}
            </div>
            <div className="mt-4 text-xs text-zinc-500">
              数据源：
              {pcShipments?.source ? (
                <a
                  className="ml-1 inline-block max-w-full truncate align-bottom text-blue-600 hover:underline"
                  href={pcShipments.source}
                  target="_blank"
                  rel="noreferrer"
                  title={pcShipments.source}
                >
                  {pcShipments.note ?? pcShipments.source}
                </a>
              ) : (
                <span className="ml-1">未填写</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-xs font-medium text-zinc-500">PC 浏览器份额（月）</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
              <span>
                数据时间： <span className="font-medium text-zinc-900">{browserMonthLabel}</span>
              </span>
              <span>
                品牌数：{" "}
                <span className="font-medium text-zinc-900">
                  {browserShare ? Object.keys(browserShare.shares || {}).length : 0}
                </span>
              </span>
            </div>
            <div className="mt-5">
              {browserShare ? (
                <BrowserSharePie variant="full" layout="sideBySide" shares={browserShare.shares || {}} />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  暂无数据
                </div>
              )}
            </div>
            <div className="mt-4 text-xs text-zinc-500">
              数据源：
              {browserShare?.source ? (
                <a
                  className="ml-1 inline-block max-w-full truncate align-bottom text-blue-600 hover:underline"
                  href={browserShare.source}
                  target="_blank"
                  rel="noreferrer"
                  title={browserShare.source}
                >
                  {browserShare.source}
                </a>
              ) : (
                <span className="ml-1">未填写</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="text-xs font-medium text-zinc-500">PC 搜索引擎份额（月）</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
              <span>
                数据时间： <span className="font-medium text-zinc-900">{searchMonthLabel}</span>
              </span>
              <span>
                品牌数：{" "}
                <span className="font-medium text-zinc-900">
                  {searchShare ? Object.keys(searchShare.shares || {}).length : 0}
                </span>
              </span>
            </div>
            <div className="mt-5">
              {searchShare ? (
                <SharePie
                  variant="full"
                  layout="sideBySide"
                  shares={searchShare.shares}
                  labelMap={searchEngineLabelMap}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  暂无数据
                </div>
              )}
            </div>
            <div className="mt-4 text-xs text-zinc-500">
              数据源：
              {searchShare?.source ? (
                <a
                  className="ml-1 inline-block max-w-full truncate align-bottom text-blue-600 hover:underline"
                  href={searchShare.source}
                  target="_blank"
                  rel="noreferrer"
                  title={searchShare.source}
                >
                  {searchShare.note ?? searchShare.source}
                </a>
              ) : (
                <span className="ml-1">未填写</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6" />
        </div>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Steam 每周畅销榜</h2>
            <span className="text-xs text-zinc-500">数据来自 Supabase；同批次按 fetched_at / updated_at 等时间列自动取最新一批</span>
          </div>
          {steamWeeklyEnriched ? (
            <div className="grid gap-6">
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h3 className="text-base font-semibold">主榜</h3>
                <div className="text-xs text-zinc-500">箭头为排名变化（若表中有 rank_delta / last_week_rank 等列）</div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="divide-y divide-zinc-100">
                  {steamWeeklyEnriched.items.slice(0, 20).map((it) => (
                    <div key={`${it.rank}-${it.name ?? it.appid ?? ""}`} className="hover:bg-zinc-50/60">
                      <div className="flex flex-col gap-3 px-4 py-3 sm:hidden">
                        <div className="flex items-start gap-3">
                          <div className="tabular-nums pt-0.5">
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
                              #{it.rank}
                            </span>
                            <Arrow delta={it.rankDelta} />
                          </div>
                          {it.headerImage ? (
                            <img
                              src={it.headerImage}
                              alt={it.name || `Steam Game ${it.appid ?? ""}`}
                              className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <SteamAppLink
                                appid={it.appid}
                                className="truncate text-[15px] font-semibold text-zinc-900 hover:underline"
                              >
                                {it.name || (it.appid ? `App ${it.appid}` : "—")}
                              </SteamAppLink>
                              {it.isNewEntry ? (
                                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  新上榜
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                              {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="tabular-nums text-zinc-700">
                            <div className="text-sm font-semibold text-zinc-900">{it.priceText || "-"}</div>
                            {typeof it.discountPercent === "number" && it.discountPercent > 0 ? (
                              <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                -{it.discountPercent}%
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-4 px-4 py-3">
                        <div className="tabular-nums">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
                            #{it.rank}
                          </span>
                          <Arrow delta={it.rankDelta} />
                        </div>
                        {it.headerImage ? (
                          <img
                            src={it.headerImage}
                            alt={it.name || `Steam Game ${it.appid ?? ""}`}
                            className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <SteamAppLink
                              appid={it.appid}
                              className="truncate text-[15px] font-semibold text-zinc-900 hover:underline"
                            >
                              {it.name || (it.appid ? `App ${it.appid}` : "—")}
                            </SteamAppLink>
                            {it.isNewEntry ? (
                              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                新上榜
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                            {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                          </div>
                        </div>
                        <div className="tabular-nums text-zinc-700">
                          <div className="text-sm font-semibold text-zinc-900">{it.priceText || "-"}</div>
                          {typeof it.discountPercent === "number" && it.discountPercent > 0 ? (
                            <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                              -{it.discountPercent}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold">本周新上榜</h3>
                <div className="mt-3 space-y-2">
                  {steamWeeklyEnriched.newEntries.length === 0 ? (
                    <div className="text-sm text-zinc-500">当前批次没有标记为新上榜的条目。</div>
                  ) : (
                    steamWeeklyEnriched.newEntries.slice(0, 10).map((it) => (
                      <div key={it.appid ?? it.rank} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <SteamAppLink appid={it.appid} className="truncate text-sm font-medium hover:underline">
                            {it.name || `App ${it.appid}`}
                          </SteamAppLink>
                          <div className="truncate text-xs text-zinc-500">
                            {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-zinc-600">#{it.rank}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold">本周涨跌幅最大</h3>
                <div className="mt-3 grid gap-4">
                  <div>
                    <div className="text-xs font-medium text-zinc-500">上升</div>
                    <div className="mt-2 space-y-2">
                      {steamWeeklyEnriched.moversUp.length === 0 ? (
                        <div className="text-sm text-zinc-500">暂无。</div>
                      ) : (
                        steamWeeklyEnriched.moversUp.map((it) => (
                          <div key={it.appid ?? it.rank} className="flex items-center justify-between gap-3">
                            <SteamAppLink appid={it.appid} className="min-w-0 truncate text-sm font-medium hover:underline">
                              {it.name || `App ${it.appid}`}
                            </SteamAppLink>
                            <div className="shrink-0 text-xs font-semibold text-emerald-700">
                              ↑{it.rankDelta}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-500">下降</div>
                    <div className="mt-2 space-y-2">
                      {steamWeeklyEnriched.moversDown.length === 0 ? (
                        <div className="text-sm text-zinc-500">暂无。</div>
                      ) : (
                        steamWeeklyEnriched.moversDown.map((it) => (
                          <div key={it.appid ?? it.rank} className="flex items-center justify-between gap-3">
                            <SteamAppLink appid={it.appid} className="min-w-0 truncate text-sm font-medium hover:underline">
                              {it.name || `App ${it.appid}`}
                            </SteamAppLink>
                            <div className="shrink-0 text-xs font-semibold text-rose-700">
                              ↓{Math.abs(it.rankDelta ?? 0)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              <p className="font-medium text-zinc-800">暂无数据</p>
              <p className="mt-2">请向 Supabase 表 <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">steam_weekly_topsellers</code> 写入榜单行（至少含 rank 与 name/title）。若有多批次，建议带 <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">fetched_at</code> 或 <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">updated_at</code> 以便取最新一批。</p>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Steam 平台动态摘要</h2>
            <p className="mt-1 text-xs text-zinc-500">来自 Supabase <code className="rounded bg-zinc-100 px-1">steam_updates_summary</code>（取最新一条）</p>
          </div>
          {steamUpdatesSummary ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              {steamUpdatesSummary.title ? (
                <h3 className="text-base font-semibold text-zinc-900">{steamUpdatesSummary.title}</h3>
              ) : null}
              {steamUpdatesSummary.updatedAt ? (
                <p className="mt-1 text-xs text-zinc-500">更新：{dateOnlyLabel(steamUpdatesSummary.updatedAt)}</p>
              ) : null}
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700">
                {steamUpdatesSummary.body}
              </pre>
              {steamUpdatesSummary.extra ? (
                <a className="mt-3 inline-block text-xs text-blue-600 hover:underline" href={steamUpdatesSummary.extra} target="_blank" rel="noreferrer">
                  相关链接
                </a>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              暂无数据。
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Steam 即将推出热门</h2>
            <p className="mt-1 text-xs text-zinc-500">来自 Supabase <code className="rounded bg-zinc-100 px-1">steam_upcoming_popular</code></p>
          </div>
          {steamUpcomingEnriched?.items?.length ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="divide-y divide-zinc-100">
                {steamUpcomingEnriched.items.slice(0, 20).map((it) => (
                  <div key={`${it.rank}-${it.name}`} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50/60">
                    <div className="tabular-nums">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
                        #{it.rank}
                      </span>
                    </div>
                    {it.headerImage ? (
                      <img
                        src={it.headerImage}
                        alt={it.name}
                        className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <SteamAppLink appid={it.appid} className="truncate text-[15px] font-semibold text-zinc-900 hover:underline">
                        {it.name}
                      </SteamAppLink>
                      <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-xs text-zinc-600">
                      <div>发售日：<span className="font-semibold text-zinc-900">{it.releaseDateText || "—"}</span></div>
                      <div className="mt-0.5">Followers：<span className="font-semibold text-zinc-900">{typeof it.followers === "number" ? it.followers.toLocaleString() : "—"}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              暂无数据。
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Steam 月度新品热门</h2>
            <p className="mt-1 text-xs text-zinc-500">来自 Supabase <code className="rounded bg-zinc-100 px-1">steam_monthly_top_new</code>；tier 列含 gold/silver 时分组展示</p>
          </div>
          {steamMonthlyNewEnriched?.items?.length ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {(["gold", "silver", "other"] as const)
                .filter((tier) => steamMonthlyNewEnriched.items.some((x) => x.tier === tier))
                .map((tier) => {
                const title = tier === "gold" ? "黄金级" : tier === "silver" ? "白银级" : "其他";
                const list = steamMonthlyNewEnriched.items.filter((x) => x.tier === tier);
                return (
                  <div key={tier} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-100">
                      <div className="divide-y divide-zinc-100">
                        {list.slice(0, 12).map((it) => (
                          <div key={`${tier}-${it.name}`} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50/60">
                            {it.headerImage ? (
                              <img
                                src={it.headerImage}
                                alt={it.name}
                                className="h-12 w-[92px] rounded-md border border-zinc-200 object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-12 w-[92px] rounded-md border border-zinc-200 bg-zinc-100" />
                            )}
                            <div className="min-w-0 flex-1">
                              <SteamAppLink appid={it.appid} className="truncate text-sm font-semibold text-zinc-900 hover:underline">
                                {it.name}
                              </SteamAppLink>
                              <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                                {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                              </div>
                            </div>
                            <div className="shrink-0 text-right tabular-nums text-xs text-zinc-600">
                              <div className="text-sm font-semibold text-zinc-900">{it.priceText || "—"}</div>
                              {typeof it.discountPercent === "number" && it.discountPercent > 0 ? (
                                <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                  -{it.discountPercent}%
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              暂无数据。
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Epic Games Store</h2>
            <span className="text-xs text-zinc-500">数据来自 Supabase：<code className="rounded bg-zinc-100 px-1">epic_top_sellers</code> / <code className="rounded bg-zinc-100 px-1">epic_most_played</code></span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h3 className="text-base font-semibold">最畅销</h3>
                <span className="text-xs text-zinc-500">{dateOnlyLabel(epicTop?.fetchDate)}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="divide-y divide-zinc-100">
                  {epicCharts?.topSellers?.length ? (
                    epicCharts.topSellers.slice(0, 10).map((g) => {
                      const sub: string[] = [];
                      if (g.original_price_usd != null) sub.push(`原价 USD ${g.original_price_usd.toFixed(2)}`);
                      if (g.weeks_on_chart != null) sub.push(`在榜 ${g.weeks_on_chart} 周`);
                      const subtitle = sub.length ? sub.join(" · ") : "—";
                      const priceMain =
                        g.is_free === true
                          ? "免费开玩"
                          : g.current_price_usd != null
                            ? `USD ${g.current_price_usd.toFixed(2)}`
                            : "—";
                      const priceExtra =
                        typeof g.discount_percent === "number" && g.discount_percent > 0 ? (
                          <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                            -{g.discount_percent}%
                          </span>
                        ) : undefined;
                      return (
                        <ChartListRow
                          key={`epic-top-${g.rank}`}
                          rank={g.rank}
                          coverUrl={g.cover_image}
                          title={g.name}
                          titleHref={g.epic_store_url}
                          subtitle={subtitle}
                          priceMain={priceMain}
                          priceExtra={priceExtra}
                        />
                      );
                    })
                  ) : (
                    <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h3 className="text-base font-semibold">最多人游玩</h3>
                <span className="text-xs text-zinc-500">{dateOnlyLabel(epicMostPlayed?.fetchDate)}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="divide-y divide-zinc-100">
                  {epicCharts?.mostPlayed?.length ? (
                    epicCharts.mostPlayed.slice(0, 10).map((g) => {
                      const parts: string[] = [];
                      if (g.is_free != null) parts.push(g.is_free ? "免费开玩" : "付费");
                      if (g.weeks_on_chart != null) parts.push(`在榜 ${g.weeks_on_chart} 周`);
                      const subtitle = parts.length ? parts.join(" · ") : "—";
                      return (
                        <ChartListRow
                          key={`epic-mp-${g.rank}`}
                          rank={g.rank}
                          coverUrl={g.cover_image}
                          title={g.name}
                          titleHref={g.epic_store_url}
                          subtitle={subtitle}
                          priceMain="—"
                        />
                      );
                    })
                  ) : (
                    <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">WeGame</h2>
            <span className="text-xs text-zinc-500">数据来自 Supabase：<code className="rounded bg-zinc-100 px-1">wegame_bestseller</code> / <code className="rounded bg-zinc-100 px-1">wegame_purchase</code> / <code className="rounded bg-zinc-100 px-1">wegame_follow</code></span>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              { title: "火爆新品", table: "wegame_bestseller" as const, pack: wgBestseller },
              { title: "本周热销", table: "wegame_purchase" as const, pack: wgPurchase },
              { title: "新游预约", table: "wegame_follow" as const, pack: wgFollow },
            ].map((x) => (
              <div key={x.table}>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h3 className="text-base font-semibold">{x.title}</h3>
                  <span className="text-xs text-zinc-500">{dateOnlyLabel(x.pack?.generatedAt)}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="divide-y divide-zinc-100">
                    {x.pack?.games?.length ? (
                      x.pack.games.slice(0, 15).map((g) => {
                        const subtitle = g.tags.length ? g.tags.slice(0, 5).join(" · ") : "标签未知";
                        const priceExtra =
                          typeof g.weekly_follows === "number" ? (
                            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                              本周预约 {g.weekly_follows.toLocaleString()}
                            </span>
                          ) : undefined;
                        return (
                          <ChartListRow
                            key={`${x.table}-${g.rank}`}
                            rank={g.rank}
                            coverUrl={g.cover_image}
                            title={g.title}
                            titleHref={g.store_url}
                            subtitle={subtitle}
                            priceMain={g.price ?? "—"}
                            priceExtra={priceExtra}
                          />
                        );
                      })
                    ) : (
                      <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">TapTap（PC）</h2>
            <span className="text-xs text-zinc-500">数据来自 Supabase：<code className="rounded bg-zinc-100 px-1">taptap_hot_download</code> / <code className="rounded bg-zinc-100 px-1">taptap_test_hot</code></span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "热门下载", key: "hot", pack: tapHot },
              { title: "测试热度", key: "test", pack: tapTest },
            ].map((x) => (
              <div key={x.key}>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h3 className="text-base font-semibold">{x.title}</h3>
                  <span className="text-xs text-zinc-500">{dateOnlyLabel(x.pack?.generatedAt)}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="divide-y divide-zinc-100">
                    {x.pack?.games?.length ? (
                      x.pack.games.slice(0, 20).map((g) => {
                        const sub: string[] = [];
                        if (typeof g.rating === "number") sub.push(`评分 ${g.rating.toFixed(1)}`);
                        if (g.tags.length) sub.push(g.tags.slice(0, 5).join(" · "));
                        if (g.test_status) sub.push(g.test_status);
                        const subtitle = sub.length ? sub.join(" · ") : "—";
                        return (
                          <ChartListRow
                            key={`${x.key}-${g.rank}`}
                            rank={g.rank}
                            coverUrl={g.cover_image}
                            title={g.title}
                            titleHref={g.store_url}
                            subtitle={subtitle}
                            priceMain={g.price ?? "—"}
                          />
                        );
                      })
                    ) : (
                      <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">4399 摘要</h2>
            <p className="mt-1 text-xs text-zinc-500">来自 Supabase <code className="rounded bg-zinc-100 px-1">data_4399_summary</code>（取最新一条）</p>
          </div>
          {summary4399 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              {summary4399.title ? <h3 className="text-base font-semibold text-zinc-900">{summary4399.title}</h3> : null}
              {summary4399.updatedAt ? (
                <p className="mt-1 text-xs text-zinc-500">更新：{dateOnlyLabel(summary4399.updatedAt)}</p>
              ) : null}
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700">
                {summary4399.body}
              </pre>
              {summary4399.extra ? (
                <a className="mt-3 inline-block text-xs text-blue-600 hover:underline" href={summary4399.extra} target="_blank" rel="noreferrer">
                  相关链接
                </a>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              暂无数据。
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

