import { buildSteamWeeklyTopSellersReport } from "@/lib/report/steamWeekly";
import { buildSteamMostPlayedReport } from "@/lib/report/steamMostPlayed";
import { loadSteamMdReport } from "@/lib/report/steamMd";
import { loadEpicCharts, loadEpicUpcoming, loadTapTapList, loadWeGameList } from "@/lib/report/localLists";
import { getLatestBrowserShare, getLatestPcShipmentsQuarterly, getLatestSearchEngineShare } from "@/lib/report/staticSeries";
import { BrowserSharePie } from "./BrowserSharePie";
import { SharePie } from "./SharePie";

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const report = await (async () => {
    try {
      return await buildSteamWeeklyTopSellersReport({ cc: "CN", days: 7, limit: 20 });
    } catch {
      return null;
    }
  })();

  const mostPlayed = await (async () => {
    try {
      return await buildSteamMostPlayedReport({ cc: "CN", limit: 10 });
    } catch {
      return null;
    }
  })();

  const steamMd = await (async () => {
    try {
      return await loadSteamMdReport({ cc: "CN" });
    } catch {
      return null;
    }
  })();

  const [epicCharts, epicUpcoming, wgBestseller, wgPurchase, wgFollow, tapHot, tapTest] = await Promise.all([
    loadEpicCharts(),
    loadEpicUpcoming(),
    loadWeGameList("bestseller"),
    loadWeGameList("purchase"),
    loadWeGameList("follow"),
    loadTapTapList("hot_download"),
    loadTapTapList("test_hot"),
  ]);

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
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-zinc-600">综合周报（自动生成）</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">PC 行业周报</h1>
            {report ? (
              <p className="mt-3 text-sm text-zinc-600">
                窗口：近 {report.windowDays} 天；国家：{report.countryCode}；时间：
                {new Date(report.startCapturedAt).toLocaleString()} ～{" "}
                {new Date(report.endCapturedAt).toLocaleString()}
              </p>
            ) : (
              <p className="mt-3 text-sm text-rose-700">
                本周快照不足（至少需要 2 条快照）。先手动抓两次再来看。
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
            <h2 className="text-lg font-semibold tracking-tight">Steam 中国畅销</h2>
            <span className="text-xs text-zinc-500">数据来自已入库快照；对比窗口与页眉说明一致</span>
          </div>
          {report ? (
            <div className="grid gap-6">
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h3 className="text-base font-semibold">本周 Top20（以最新快照为准）</h3>
                <div className="text-xs text-zinc-500">箭头为“相对本周第一条快照”的变动</div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="divide-y divide-zinc-100">
                  {report.top.map((it) => (
                    <div key={it.rank} className="hover:bg-zinc-50/60">
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
                              alt={it.name || `Steam Game ${it.appid}`}
                              className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-[15px] font-semibold text-zinc-900">
                                {it.name || `App ${it.appid}`}
                              </div>
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
                          <a
                            className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                            href={`https://store.steampowered.com/app/${it.appid}/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            商店页
                          </a>
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
                            alt={it.name || `Steam Game ${it.appid}`}
                            className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-[15px] font-semibold text-zinc-900">
                              {it.name || `App ${it.appid}`}
                            </div>
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
                        <a
                          className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                          href={`https://store.steampowered.com/app/${it.appid}/`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          商店页
                        </a>
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
                  {report.newEntries.length === 0 ? (
                    <div className="text-sm text-zinc-500">本周 Top20 没有新上榜。</div>
                  ) : (
                    report.newEntries.slice(0, 10).map((it) => (
                      <div key={it.appid} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{it.name || `App ${it.appid}`}</div>
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
                    <div className="text-xs font-medium text-zinc-500">上升 Top5</div>
                    <div className="mt-2 space-y-2">
                      {report.moversUp.length === 0 ? (
                        <div className="text-sm text-zinc-500">暂无。</div>
                      ) : (
                        report.moversUp.map((it) => (
                          <div key={it.appid} className="flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-sm font-medium">
                              {it.name || `App ${it.appid}`}
                            </div>
                            <div className="shrink-0 text-xs font-semibold text-emerald-700">
                              ↑{it.rankDelta}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-500">下降 Top5</div>
                    <div className="mt-2 space-y-2">
                      {report.moversDown.length === 0 ? (
                        <div className="text-sm text-zinc-500">暂无。</div>
                      ) : (
                        report.moversDown.map((it) => (
                          <div key={it.appid} className="flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-sm font-medium">
                              {it.name || `App ${it.appid}`}
                            </div>
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
              <p className="font-medium text-zinc-800">本窗口内可用于对比的 Steam 快照不足</p>
              <p className="mt-2">至少需要 2 条「中国区 Top Sellers」快照才能计算排名变化、新上榜与涨跌榜。可由 Vercel Cron 每日抓取，或手动请求 <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">/api/cron/steam/top-sellers</code>（需配置 Cron Secret）。</p>
              {steamMd?.topSellers?.length ? (
                <div className="mt-6 text-left">
                  <div className="mb-2 text-xs font-medium text-zinc-500">兜底数据：来自 `data/PC游戏行业周报_20260401.md`</div>
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="divide-y divide-zinc-100">
                      {steamMd.topSellers.slice(0, 20).map((it) => (
                        <div key={it.rank} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50/60">
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
                            <div className="truncate text-[15px] font-semibold text-zinc-900">{it.name}</div>
                            <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                              {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right tabular-nums text-xs text-zinc-600">
                              <div className="text-sm font-semibold text-zinc-900">{it.priceText || "-"}</div>
                              {typeof it.discountPercent === "number" && it.discountPercent > 0 ? (
                                <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                  -{it.discountPercent}%
                                </span>
                              ) : null}
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              变化：{it.rankChangeText} · 周数：{it.weeksOnChart ?? "—"}
                            </div>
                          </div>
                          {it.appid ? (
                            <a
                              className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                              href={`https://store.steampowered.com/app/${it.appid}/`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              商店页
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Steam 热门即将推出（数据）</h2>
            <p className="mt-1 text-xs text-zinc-500">仅展示数据（来自本地 MD；可用时会补齐封面/类型）。</p>
          </div>
          {steamMd?.upcoming?.length ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="divide-y divide-zinc-100">
                {steamMd.upcoming.slice(0, 20).map((it) => (
                  <div key={it.rank} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50/60">
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
                      <div className="truncate text-[15px] font-semibold text-zinc-900">{it.name}</div>
                      <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-xs text-zinc-600">
                      <div>发售日：<span className="font-semibold text-zinc-900">{it.releaseDateText || "—"}</span></div>
                      <div className="mt-0.5">Followers：<span className="font-semibold text-zinc-900">{typeof it.followers === "number" ? it.followers.toLocaleString() : "—"}</span></div>
                    </div>
                    {it.appid ? (
                      <a
                        className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        href={`https://store.steampowered.com/app/${it.appid}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        商店页
                      </a>
                    ) : null}
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
            <h2 className="text-lg font-semibold tracking-tight">Steam 当月热门新品（数据）</h2>
            <p className="mt-1 text-xs text-zinc-500">仅展示数据（来自本地 MD；分黄金/白银）。</p>
          </div>
          {steamMd?.newReleases?.length ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {(["gold", "silver"] as const).map((tier) => {
                const title = tier === "gold" ? "黄金级" : "白银级";
                const list = steamMd.newReleases.filter((x) => x.tier === tier);
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
                              <div className="truncate text-sm font-semibold text-zinc-900">{it.name}</div>
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
                            {it.appid ? (
                              <a
                                className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                                href={`https://store.steampowered.com/app/${it.appid}/`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                商店页
                              </a>
                            ) : null}
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Steam 最热玩（API）</h2>
            <p className="mt-1 text-xs text-zinc-500">数据来自 Steam Web API（Most Played Games）；仅展示 Top10。</p>
          </div>
          {mostPlayed ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="divide-y divide-zinc-100">
                {mostPlayed.top.map((it) => (
                  <div key={it.appid} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50/60">
                    <div className="tabular-nums">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
                        #{it.rank}
                      </span>
                    </div>
                    {it.headerImage ? (
                      <img
                        src={it.headerImage}
                        alt={it.name || `Steam Game ${it.appid}`}
                        className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-zinc-900">
                        {it.name || `App ${it.appid}`}
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {it.genres.length ? it.genres.join(" · ") : "类型未知"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-xs text-zinc-600">
                      <div className="mt-0.5">
                        当日在线峰值：{" "}
                        <span className="font-semibold text-zinc-900">
                          {typeof it.peakInGame === "number" ? it.peakInGame.toLocaleString() : "—"}
                        </span>
                      </div>
                    </div>
                    <a
                      className="inline-flex shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      href={`https://store.steampowered.com/app/${it.appid}/`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      商店页
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-sm text-zinc-600">
              <p className="font-medium text-zinc-800">未配置 Steam Web API key 或 API 暂不可用</p>
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Epic Games Store</h2>
            <span className="text-xs text-zinc-500">数据来自本地 JSON（egdata.app / GraphQL 抓取结果）</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3">
                <h3 className="text-base font-semibold">最畅销 Top10（数据）</h3>
                <span className="text-xs text-zinc-500">{epicCharts?.meta.fetchDate ?? "—"}</span>
              </div>
              <div className="mt-3 space-y-2">
                {epicCharts?.topSellers?.length ? (
                  epicCharts.topSellers.slice(0, 10).map((g) => (
                    <div key={g.rank} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          <span className="mr-2 tabular-nums text-zinc-500">#{g.rank}</span>
                          {g.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500">
                          USD：{g.current_price_usd == null ? "—" : g.current_price_usd.toFixed(2)}
                          {g.original_price_usd != null ? `（原价 ${g.original_price_usd.toFixed(2)}）` : ""} · 折扣：
                          {g.discount_percent == null ? "—" : `-${g.discount_percent}%`} · 在榜周数：
                          {g.weeks_on_chart ?? "—"}
                        </div>
                      </div>
                      {g.epic_store_url ? (
                        <a
                          className="shrink-0 text-xs text-blue-600 hover:underline"
                          href={g.epic_store_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          打开
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">暂无数据。</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3">
                <h3 className="text-base font-semibold">最多人游玩 Top10（数据）</h3>
                <span className="text-xs text-zinc-500">{epicCharts?.meta.fetchDate ?? "—"}</span>
              </div>
              <div className="mt-3 space-y-2">
                {epicCharts?.mostPlayed?.length ? (
                  epicCharts.mostPlayed.slice(0, 10).map((g) => (
                    <div key={g.rank} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          <span className="mr-2 tabular-nums text-zinc-500">#{g.rank}</span>
                          {g.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500">
                          是否免费：{g.is_free == null ? "—" : g.is_free ? "是" : "否"} · 在榜周数：
                          {g.weeks_on_chart ?? "—"}
                        </div>
                      </div>
                      {g.epic_store_url ? (
                        <a
                          className="shrink-0 text-xs text-blue-600 hover:underline"
                          href={g.epic_store_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          打开
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">暂无数据。</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between gap-3">
              <h3 className="text-base font-semibold">即将推出 Top30（数据）</h3>
              <span className="text-xs text-zinc-500">{epicUpcoming?.meta.generatedAt ?? "—"}</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-100">
              {epicUpcoming?.games?.length ? (
                <div className="divide-y divide-zinc-100">
                  {epicUpcoming.games.slice(0, 30).map((g) => (
                    <div key={g.rank} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          <span className="mr-2 tabular-nums text-zinc-500">#{g.rank}</span>
                          {g.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span>价格：{g.price ?? "—"}</span>
                          {g.developer ? <span>开发商：{g.developer}</span> : null}
                          {g.tags.length ? <span className="truncate">标签：{g.tags.slice(0, 6).join(" · ")}</span> : null}
                        </div>
                      </div>
                      {g.store_url ? (
                        <a className="shrink-0 text-xs text-blue-600 hover:underline" href={g.store_url} target="_blank" rel="noreferrer">
                          打开
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">WeGame</h2>
            <span className="text-xs text-zinc-500">数据来自本地 JSON（DOM 解析抓取结果）</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              { title: "火爆新品 Top15（数据）", data: wgBestseller },
              { title: "本周热销 Top15（数据）", data: wgPurchase },
              { title: "新游预约 Top15（数据）", data: wgFollow },
            ].map((x) => (
              <div key={x.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-base font-semibold">{x.title}</h3>
                  <span className="text-xs text-zinc-500">{x.data?.meta.generatedAt ?? "—"}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {x.data?.games?.length ? (
                    x.data.games.slice(0, 15).map((g) => (
                      <div key={g.rank} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">
                            <span className="mr-2 tabular-nums text-zinc-500">#{g.rank}</span>
                            {g.title}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500">
                            {g.tags.length ? `标签：${g.tags.slice(0, 5).join(" · ")}` : "标签：—"} · 价格：{g.price ?? "—"}
                            {typeof g.weekly_follows === "number" ? ` · 本周预约：${g.weekly_follows.toLocaleString()}` : ""}
                          </div>
                        </div>
                        {g.store_url ? (
                          <a className="shrink-0 text-xs text-blue-600 hover:underline" href={g.store_url} target="_blank" rel="noreferrer">
                            打开
                          </a>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">暂无数据。</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">TapTap（PC）</h2>
            <span className="text-xs text-zinc-500">数据来自本地 JSON（DOM 解析抓取结果）</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "热门下载 Top20（数据）", data: tapHot },
              { title: "测试热度 Top20（数据）", data: tapTest },
            ].map((x) => (
              <div key={x.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-base font-semibold">{x.title}</h3>
                  <span className="text-xs text-zinc-500">{x.data?.meta.generatedAt ?? "—"}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {x.data?.games?.length ? (
                    x.data.games.slice(0, 20).map((g) => (
                      <div key={g.rank} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">
                            <span className="mr-2 tabular-nums text-zinc-500">#{g.rank}</span>
                            {g.title}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500">
                            评分：{typeof g.rating === "number" ? g.rating.toFixed(1) : "—"} ·{" "}
                            {g.tags.length ? `标签：${g.tags.slice(0, 5).join(" · ")}` : "标签：—"} · 状态：
                            {g.test_status ?? "—"}
                          </div>
                        </div>
                        {g.store_url ? (
                          <a className="shrink-0 text-xs text-blue-600 hover:underline" href={g.store_url} target="_blank" rel="noreferrer">
                            打开
                          </a>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">暂无数据。</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

