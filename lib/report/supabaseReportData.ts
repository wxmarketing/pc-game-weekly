import { tryCreateSupabaseServiceClient } from "@/lib/supabase/server";
import type { SteamAppBrief } from "@/lib/steam/appDetails";
import type { EpicChartGame, TapGame, WgGame } from "@/lib/report/localLists";
import { unstable_cache } from "next/cache";
import { resolveSteamAppIdByName } from "@/lib/steam/resolveAppId";

export type Row = Record<string, unknown>;

function num(r: Row, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === "") continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) return v;
      continue;
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) continue;
      const direct = Number(s);
      if (Number.isFinite(direct)) return direct;

      // 支持 Supabase 文本列里用箭头表达变化（例如 "▲ 3" / "▼2" / "↑ 1" / "↓ 4"）
      const hasDown = /[▼▽↓−-]/.test(s);
      const hasUp = /[▲△↑+＋]/.test(s);
      const m = s.match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const base = Number(m[1]);
        if (Number.isFinite(base)) {
          const sign = hasDown && !hasUp ? -1 : 1;
          return sign * base;
        }
      }
      continue;
    }

    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(r: Row, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function boolish(r: Row, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "1" || v === "true") return true;
    if (v === 0 || v === "0" || v === "false") return false;
  }
  return null;
}

function genresFromRow(r: Row): string[] {
  const g = r.genres ?? r.tags ?? r.game_genres;
  if (Array.isArray(g))
    return g
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
  if (typeof g === "string") return g.split(/[,，、|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** 从 batch 首行提取最佳时间字符串 */
function extractFetchDate(batch: Row[]): string | null {
  if (!batch.length) return null;
  const r = batch[0]!;
  const timeCols = ["fetched_at", "ingested_at", "snapshot_at", "batch_at", "created_at", "updated_at", "period_start"] as const;
  for (const c of timeCols) {
    const v = r[c];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** 若表按批次写入，取时间列最新的一批 */
function pickLatestBatch(rows: Row[]): Row[] {
  if (rows.length === 0) return [];
  const sample = rows[0]!;
  const timeCols = ["fetched_at", "ingested_at", "snapshot_at", "batch_at", "created_at", "updated_at", "period_start"] as const;
  const tcol = timeCols.find((c) => sample[c] != null && sample[c] !== "");
  if (!tcol) return rows;
  let max = "";
  for (const r of rows) {
    const v = r[tcol];
    if (v == null) continue;
    const s = String(v);
    if (s > max) max = s;
  }
  if (!max) return rows;
  const filtered = rows.filter((r) => String(r[tcol] ?? "") === max);
  return filtered.length ? filtered : rows;
}

function sortByRank(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (num(a, "rank", "position", "idx") ?? 9999) - (num(b, "rank", "position", "idx") ?? 9999));
}

/** Steam 商店通用头图（无库内 URL 时用 appid 拼） */
function steamStoreHeaderImage(appid: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

/**
 * 从行里解析封面图 URL（兼容多种列名 + 常见 json/jsonb 嵌套）
 */
function steamImageUrlFromRow(r: Row): string | null {
  const direct = str(
    r,
    "cover_image",
    "header_image",
    "header_image_url",
    "headerImage",
    "header_url",
    "capsule_image",
    "capsule_image_url",
    "capsule_url",
    "small_capsule",
    "library_capsule",
    "image_url",
    "image",
    "img",
    "cover_url",
    "cover",
    "icon_url",
    "steam_capsule",
  );
  if (direct) return direct;

  const blobKeys = ["image_metadata", "assets", "steam_media", "media", "images", "raw", "payload", "extra"] as const;
  for (const k of blobKeys) {
    const blob = r[k];
    if (blob && typeof blob === "object" && blob !== null && !Array.isArray(blob)) {
      const nested = str(
        blob as Row,
        "cover_image",
        "header",
        "header_url",
        "header_image",
        "capsule",
        "capsule_url",
        "image",
        "url",
        "small_capsule",
      );
      if (nested) return nested;
    }
  }
  return null;
}

function resolveSteamHeaderImage(r: Row, appid: number | null): string | null {
  const fromDb = steamImageUrlFromRow(r);
  if (fromDb) return fromDb;
  if (appid != null && appid > 0) return steamStoreHeaderImage(appid);
  return null;
}

async function fetchAllRows(table: string, limit = 800): Promise<Row[]> {
  const supabase = tryCreateSupabaseServiceClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from(table).select("*").limit(limit);
    if (error || !data?.length) return [];
    return data as Row[];
  } catch {
    return [];
  }
}

type KnownTable =
  | "steam_weekly_topsellers"
  | "steam_upcoming_popular"
  | "steam_monthly_top_new"
  | "steam_updates_summary"
  | "data_4399_summary"
  | "epic_top_sellers"
  | "epic_most_played"
  | "epic_free_games"
  | "wegame_bestseller"
  | "wegame_purchase"
  | "wegame_follow"
  | "taptap_hot_download"
  | "taptap_test_hot";

const BASE_TIME_COLS =
  "fetched_at,updated_at,created_at,ingested_at,snapshot_at,batch_at,period_start,fetch_date,generated_at,period_label,week_label,chart_name,source";

const SELECT_COLS: Record<KnownTable, string> = {
  steam_weekly_topsellers: `${BASE_TIME_COLS},rank,position,appid,app_id,steam_appid,name,title,game_name,price_text,price,final_price,current_price,price_cny,current_price_cny,discount_percent,discount,discount_pct,genres,tags,game_genres,weeks_on_chart,weeks,change,rank_delta,rank_change,last_week_rank,prev_rank,is_new,is_new_entry,new_entry,entry_type,badge,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_upcoming_popular: `${BASE_TIME_COLS},rank,position,appid,app_id,steam_appid,name,title,game_name,release_date,release_date_text,coming_date,followers,wishlist_count,follows,genres,tags,game_genres,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_monthly_top_new: `${BASE_TIME_COLS},rank,position,idx,tier,level,badge,category,appid,app_id,steam_appid,name,title,game_name,price_text,price,discount_percent,discount,genres,tags,game_genres,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_updates_summary: `${BASE_TIME_COLS},title,heading,name,period_label,body,content,summary,text,markdown,description,digest,source_url,url,link,payload`,
  data_4399_summary: `${BASE_TIME_COLS},time_window,total_count,category_breakdown,source_url,url,link,payload,title,heading,name,period_label`,
  epic_top_sellers: `${BASE_TIME_COLS},rank,position,name,title,game_name,tags,genres,game_genres,current_price_num,original_price_num,currency,original_price,current_price_usd,price_usd,current_price,original_price_usd,msrp_usd,discount_percent,discount,weeks_on_chart,weeks,is_free,free,epic_store_url,store_url,url,cover_image,header_image,image_url,thumbnail,thumb`,
  epic_most_played: `${BASE_TIME_COLS},rank,position,name,title,game_name,tags,genres,game_genres,current_price_num,original_price_num,currency,original_price,current_price_usd,price_usd,current_price,original_price_usd,msrp_usd,discount_percent,discount,weeks_on_chart,weeks,is_free,free,epic_store_url,store_url,url,cover_image,header_image,image_url,thumbnail,thumb`,
  epic_free_games: `${BASE_TIME_COLS},rank,position,name,title,game_name,tags,genres,game_genres,epic_store_url,store_url,url,cover_image,header_image,image_url,thumbnail,thumb,promo_start,promo_end,description,desc`,
  wegame_bestseller: `${BASE_TIME_COLS},rank,position,title,name,game_name,tags,genres,game_genres,price,price_text,store_url,url,link,weekly_follows,follows,reservations,cover_image,header_image,image_url,thumbnail,thumb`,
  wegame_purchase: `${BASE_TIME_COLS},rank,position,title,name,game_name,tags,genres,game_genres,price,price_text,store_url,url,link,weekly_follows,follows,reservations,cover_image,header_image,image_url,thumbnail,thumb`,
  wegame_follow: `${BASE_TIME_COLS},rank,position,title,name,game_name,tags,genres,game_genres,price,price_text,store_url,url,link,weekly_follows,follows,reservations,cover_image,header_image,image_url,thumbnail,thumb`,
  taptap_hot_download: `${BASE_TIME_COLS},rank,position,title,name,game_name,rating,score,tags,genres,game_genres,price,price_text,description,desc,store_url,url,link,test_status,status,phase,cover_image,header_image,image_url,thumbnail,thumb`,
  taptap_test_hot: `${BASE_TIME_COLS},rank,position,title,name,game_name,rating,score,tags,genres,game_genres,price,price_text,description,desc,store_url,url,link,test_status,status,phase,cover_image,header_image,image_url,thumbnail,thumb`,
};

const fetchAllRowsCached = unstable_cache(
  async (table: KnownTable, limit: number) => {
    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) return [];
    try {
      const cols = SELECT_COLS[table] ?? "*";
      const first = await supabase.from(table).select(cols).limit(limit);
      if (!first.error && first.data?.length) return first.data as unknown as Row[];
      if (first.error) {
        // 选了不存在的列时 PostgREST 会直接报错；线上必须兜底回退到 select("*") 以避免整页无数据
        const fallback = await supabase.from(table).select("*").limit(limit);
        if (!fallback.error && fallback.data?.length) return fallback.data as unknown as Row[];
        return [];
      }
      return [];
    } catch {
      return [];
    }
  },
  ["supabase-report-rows-v1"],
  { revalidate: 120 },
);

export type SteamWeeklyDbItem = {
  rank: number;
  appid: number | null;
  name: string | null;
  priceText: string | null;
  discountPercent: number | null;
  headerImage: string | null;
  genres: string[];
  weeksOnChart: number | null;
  rankDelta: number | null;
  isNewEntry: boolean;
};

function rowToSteamWeeklyItem(r: Row): SteamWeeklyDbItem | null {
  const rank = num(r, "rank", "position");
  if (rank == null || rank <= 0) return null;
  const appid = num(r, "appid", "app_id", "steam_appid");
  const name = str(r, "name", "title", "game_name");
  const priceRaw = str(r, "price_text", "price", "final_price", "current_price");
  const priceText = priceRaw ?? (num(r, "price_cny", "current_price_cny") != null ? `¥${num(r, "price_cny", "current_price_cny")}` : null);
  const discountPercent = num(r, "discount_percent", "discount", "discount_pct");
  const aid = appid && appid > 0 ? appid : null;
  const headerImage = resolveSteamHeaderImage(r, aid);
  const genres = genresFromRow(r);
  const weeksOnChart = num(r, "weeks_on_chart", "weeks", "weeksOnChart");
  let rankDelta = num(r, "change", "rank_delta", "rank_change");
  const lastWeek = num(r, "last_week_rank", "prev_rank");
  if (rankDelta == null && lastWeek != null && lastWeek > 0) rankDelta = lastWeek - rank;
  if (lastWeek === -1) rankDelta = null;
  const isNew =
    boolish(r, "is_new", "is_new_entry", "new_entry") === true ||
    lastWeek === -1 ||
    str(r, "entry_type", "badge") === "new";
  return {
    rank,
    appid: aid,
    name: name ?? (appid ? `App ${appid}` : null),
    priceText,
    discountPercent,
    headerImage,
    genres,
    weeksOnChart,
    rankDelta: rankDelta ?? null,
    isNewEntry: !!isNew,
  };
}

export async function loadSteamWeeklyTopsellersFromSupabase(): Promise<{
  meta: { label: string | null; fetchDate: string | null };
  items: SteamWeeklyDbItem[];
  newEntries: SteamWeeklyDbItem[];
  moversUp: SteamWeeklyDbItem[];
  newOnChart: SteamWeeklyDbItem[];
} | null> {
  const raw = await fetchAllRowsCached("steam_weekly_topsellers", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const items = sortByRank(batch)
    .map(rowToSteamWeeklyItem)
    .filter((x): x is SteamWeeklyDbItem => x != null);
  if (!items.length) return null;
  const newEntries = items.filter((it) => it.isNewEntry);
  const movers = items.filter((it) => typeof it.rankDelta === "number" && it.rankDelta !== 0);
  const moversUp = [...movers].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 5);
  const newOnChart = items.filter((it) => it.weeksOnChart === 1);
  const label = str(batch[0]!, "period_label", "week_label", "chart_name", "source") ?? null;
  const fetchDate = extractFetchDate(batch);
  return { meta: { label, fetchDate }, items, newEntries, moversUp, newOnChart };
}

export type SteamUpcomingDbItem = {
  rank: number;
  name: string;
  releaseDateText: string;
  followers: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

function rowToSteamUpcoming(r: Row): SteamUpcomingDbItem | null {
  const rank = num(r, "rank", "position");
  if (rank == null || rank <= 0) return null;
  const name = str(r, "name", "title", "game_name");
  if (!name) return null;
  const appidRaw = num(r, "appid", "app_id", "steam_appid");
  const aid = appidRaw != null && appidRaw > 0 ? appidRaw : null;
  return {
    rank,
    name,
    releaseDateText: str(r, "release_date", "release_date_text", "coming_date") ?? "—",
    followers: num(r, "followers", "wishlist_count", "follows"),
    appid: aid,
    headerImage: resolveSteamHeaderImage(r, aid),
    genres: genresFromRow(r),
  };
}

export async function loadSteamUpcomingPopularFromSupabase(): Promise<{ items: SteamUpcomingDbItem[]; fetchDate: string | null } | null> {
  const raw = await fetchAllRowsCached("steam_upcoming_popular", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const items = sortByRank(batch).map(rowToSteamUpcoming).filter((x): x is SteamUpcomingDbItem => x != null);
  if (!items.length) return null;
  return { items, fetchDate: extractFetchDate(batch) };
}

export type SteamNewDbItem = {
  tier: "gold" | "silver" | "other";
  name: string;
  priceText: string;
  discountPercent: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

function tierFromRow(r: Row): "gold" | "silver" | "other" {
  const t = str(r, "tier", "level", "badge", "category")?.toLowerCase() ?? "";
  if (t.includes("gold") || t.includes("黄")) return "gold";
  if (t.includes("silver") || t.includes("银")) return "silver";
  return "other";
}

function rowToSteamNew(r: Row): SteamNewDbItem | null {
  const name = str(r, "name", "title", "game_name");
  if (!name) return null;
  const priceText = str(r, "price_text", "price") ?? "—";
  const appidRaw = num(r, "appid", "app_id", "steam_appid");
  const aid = appidRaw != null && appidRaw > 0 ? appidRaw : null;
  return {
    tier: tierFromRow(r),
    name,
    priceText,
    discountPercent: num(r, "discount_percent", "discount"),
    appid: aid,
    headerImage: resolveSteamHeaderImage(r, aid),
    genres: genresFromRow(r),
  };
}

/** Steam Store `appdetails` 优先；单字段 API 无值时保留库内结果 */
function mergeSteamBriefWeekly(item: SteamWeeklyDbItem, b: SteamAppBrief | undefined): SteamWeeklyDbItem {
  if (!item.appid || !b) return item;
  return {
    ...item,
    name: b.name?.trim() || item.name,
    headerImage: b.headerImage?.trim() || item.headerImage,
    priceText: b.priceText != null && b.priceText !== "" ? b.priceText : item.priceText,
    discountPercent: typeof b.discountPercent === "number" ? b.discountPercent : item.discountPercent,
    genres: b.genres.length > 0 ? b.genres : item.genres,
  };
}

function mergeSteamBriefUpcoming(item: SteamUpcomingDbItem, b: SteamAppBrief | undefined): SteamUpcomingDbItem {
  if (!item.appid || !b) return item;
  return {
    ...item,
    name: b.name?.trim() || item.name,
    headerImage: b.headerImage?.trim() || item.headerImage,
    genres: b.genres.length > 0 ? b.genres : item.genres,
  };
}

function mergeSteamBriefNew(item: SteamNewDbItem, b: SteamAppBrief | undefined): SteamNewDbItem {
  if (!item.appid || !b) return item;
  return {
    ...item,
    name: b.name?.trim() || item.name,
    headerImage: b.headerImage?.trim() || item.headerImage,
    priceText: b.priceText != null && b.priceText !== "" ? b.priceText : item.priceText,
    discountPercent: typeof b.discountPercent === "number" ? b.discountPercent : item.discountPercent,
    genres: b.genres.length > 0 ? b.genres : item.genres,
  };
}

export async function loadSteamMonthlyTopNewFromSupabase(): Promise<{ items: SteamNewDbItem[]; fetchDate: string | null } | null> {
  const raw = await fetchAllRowsCached("steam_monthly_top_new", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const items = sortByRank(batch).map(rowToSteamNew).filter((x): x is SteamNewDbItem => x != null);
  if (!items.length) return null;
  return { items, fetchDate: extractFetchDate(batch) };
}

/** 周报页合并一次 appdetails 结果，避免三块数据各打一遍 Steam */
export function attachSteamAppBriefToWeeklyReport(
  report: {
    meta: { label: string | null; fetchDate: string | null };
    items: SteamWeeklyDbItem[];
    newEntries: SteamWeeklyDbItem[];
    moversUp: SteamWeeklyDbItem[];
    newOnChart: SteamWeeklyDbItem[];
  },
  map: Map<number, SteamAppBrief>,
): {
  meta: { label: string | null; fetchDate: string | null };
  items: SteamWeeklyDbItem[];
  newEntries: SteamWeeklyDbItem[];
  moversUp: SteamWeeklyDbItem[];
  newOnChart: SteamWeeklyDbItem[];
} {
  const merged = report.items.map((it) => (it.appid ? mergeSteamBriefWeekly(it, map.get(it.appid)) : it));
  const newEntries = merged.filter((it) => it.isNewEntry);
  const movers = merged.filter((it) => typeof it.rankDelta === "number" && it.rankDelta !== 0);
  const moversUp = [...movers].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 5);
  const newOnChart = merged.filter((it) => it.weeksOnChart === 1);
  return { ...report, items: merged, newEntries, moversUp, newOnChart };
}

export function attachSteamAppBriefToUpcoming(
  data: { items: SteamUpcomingDbItem[]; fetchDate: string | null },
  map: Map<number, SteamAppBrief>,
): { items: SteamUpcomingDbItem[]; fetchDate: string | null } {
  return {
    ...data,
    items: data.items.map((it) => (it.appid ? mergeSteamBriefUpcoming(it, map.get(it.appid)) : it)),
  };
}

export function attachSteamAppBriefToMonthlyNew(
  data: { items: SteamNewDbItem[]; fetchDate: string | null },
  map: Map<number, SteamAppBrief>,
): { items: SteamNewDbItem[]; fetchDate: string | null } {
  return {
    ...data,
    items: data.items.map((it) => (it.appid ? mergeSteamBriefNew(it, map.get(it.appid)) : it)),
  };
}

export type TextSummaryBlock = {
  title: string | null;
  body: string;
  extra: string | null;
  updatedAt: string | null;
};

function rowToSummary(r: Row): TextSummaryBlock | null {
  const body =
    str(r, "body", "content", "summary", "text", "markdown", "description", "digest") ??
    (typeof r.payload === "object" && r.payload != null ? JSON.stringify(r.payload, null, 2) : null);
  if (!body) return null;
  return {
    title: str(r, "title", "heading", "name", "period_label"),
    extra: str(r, "source_url", "url", "link"),
    body,
    updatedAt: str(r, "updated_at", "created_at", "fetched_at"),
  };
}

function stripTitleWrappers(input: string): string {
  let s = input.trim();
  // 去掉首尾书名号/引号等包装符号（只处理两端，不影响中间字符）
  const open = new Set(["《", "「", "『", "“", "\"", "'", "【", "[", "(", "（"]);
  const close = new Set(["》", "」", "』", "”", "\"", "'", "】", "]", ")", "）"]);
  while (s.length >= 2 && open.has(s[0]!) && close.has(s[s.length - 1]!)) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export async function loadSteamUpdatesSummaryFromSupabase(): Promise<TextSummaryBlock | null> {
  const raw = await fetchAllRowsCached("steam_updates_summary", 200);
  if (!raw.length) return null;
  const sorted = [...raw].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at ?? a.created_at ?? 0));
    const tb = Date.parse(String(b.updated_at ?? b.created_at ?? 0));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return rowToSummary(sorted[0]!);
}

export async function load4399SummaryFromSupabase(): Promise<TextSummaryBlock | null> {
  const raw = await fetchAllRowsCached("data_4399_summary", 200);
  if (!raw.length) return null;
  const sorted = [...raw].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at ?? a.created_at ?? 0));
    const tb = Date.parse(String(b.updated_at ?? b.created_at ?? 0));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return rowToSummary(sorted[0]!);
}

export type Data4399NewGamesSummary = {
  timeWindow: string | null;
  totalCount: number | null;
  categoryBreakdown: Record<string, number>;
  updatedAt: string | null;
};

function parseCategoryBreakdown(v: unknown): Record<string, number> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n) && n >= 0) out[String(k)] = n;
    }
    return out;
  }
  if (typeof v === "string" && v.trim()) {
    try {
      return parseCategoryBreakdown(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return {};
}

export async function load4399NewGamesSummaryFromSupabase(): Promise<Data4399NewGamesSummary | null> {
  const raw = await fetchAllRowsCached("data_4399_summary", 200);
  if (!raw.length) return null;
  const sorted = [...raw].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at ?? a.created_at ?? 0));
    const tb = Date.parse(String(b.updated_at ?? b.created_at ?? 0));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  const r = sorted[0]!;
  const timeWindow = str(r, "time_window", "window", "period", "range");
  const totalCount = num(r, "total_count", "count", "new_count");
  const categoryBreakdown = parseCategoryBreakdown((r as Row).category_breakdown);
  const updatedAt = str(r, "updated_at", "created_at", "fetched_at");
  if (!timeWindow && totalCount == null && Object.keys(categoryBreakdown).length === 0) return null;
  return { timeWindow, totalCount, categoryBreakdown, updatedAt };
}

function rowToEpicGame(r: Row): EpicChartGame | null {
  const rank = num(r, "rank", "position");
  const name = str(r, "name", "title", "game_name");
  if (rank == null || rank <= 0 || !name) return null;
  return {
    rank,
    name: stripTitleWrappers(name),
    cover_image: str(r, "cover_image", "header_image", "image_url", "thumbnail", "thumb"),
    tags: genresFromRow(r),
    currency: str(r, "currency", "price_currency"),
    current_price_num: num(r, "current_price_num", "current_price", "price_num", "price_number"),
    original_price_num: num(r, "original_price_num", "original_price_number", "original_price"),
    current_price_usd: num(r, "current_price_usd", "price_usd", "current_price"),
    original_price_usd: num(r, "original_price_usd", "msrp_usd"),
    discount_percent: num(r, "discount_percent", "discount"),
    weeks_on_chart: num(r, "weeks_on_chart", "weeks"),
    is_free: boolish(r, "is_free", "free"),
    epic_store_url: str(r, "epic_store_url", "store_url", "url"),
  };
}

export async function loadEpicTopSellersFromSupabase(): Promise<{ games: EpicChartGame[]; fetchDate: string | null } | null> {
  const raw = await fetchAllRowsCached("epic_top_sellers", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const games = sortByRank(batch).map(rowToEpicGame).filter((x): x is EpicChartGame => x != null);
  if (!games.length) return null;
  const fd = str(batch[0]!, "fetch_date", "fetched_at", "updated_at", "created_at");
  return { games, fetchDate: fd };
}

export async function loadEpicMostPlayedFromSupabase(): Promise<{ games: EpicChartGame[]; fetchDate: string | null } | null> {
  const raw = await fetchAllRowsCached("epic_most_played", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const games = sortByRank(batch).map(rowToEpicGame).filter((x): x is EpicChartGame => x != null);
  if (!games.length) return null;
  const fd = str(batch[0]!, "fetch_date", "fetched_at", "updated_at", "created_at");
  return { games, fetchDate: fd };
}

export type EpicFreeGame = {
  rank: number;
  name: string;
  cover_image: string | null;
  epic_store_url: string | null;
  startAt: string | null;
  endAt: string | null;
  tags: string[];
};

function rowToEpicFreeGame(r: Row, fallbackRank: number): EpicFreeGame | null {
  const name = str(r, "name", "title", "game_name");
  if (!name) return null;
  const rank = num(r, "rank", "position") ?? fallbackRank;
  return {
    rank,
    name: stripTitleWrappers(name),
    cover_image: str(r, "cover_image", "header_image", "image_url", "thumbnail", "thumb"),
    epic_store_url: str(r, "epic_store_url", "store_url", "url"),
    startAt: str(r, "promo_start"),
    endAt: str(r, "promo_end"),
    tags: genresFromRow(r),
  };
}

export async function loadEpicFreeGamesFromSupabase(): Promise<{ games: EpicFreeGame[]; fetchDate: string | null } | null> {
  const raw = await fetchAllRowsCached("epic_free_games", 200);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const games = batch
    .map((r, i) => rowToEpicFreeGame(r, i + 1))
    .filter((x): x is EpicFreeGame => x != null)
    .sort((a, b) => a.rank - b.rank);
  if (!games.length) return null;
  const fd = str(batch[0]!, "fetch_date", "fetched_at", "updated_at", "created_at", "generated_at");
  return { games, fetchDate: fd };
}

function rowToWg(r: Row): WgGame | null {
  const rank = num(r, "rank", "position");
  const title = str(r, "title", "name", "game_name");
  if (rank == null || rank <= 0 || !title) return null;
  const tags = genresFromRow(r);
  return {
    rank,
    title,
    cover_image: str(r, "cover_image", "header_image", "image_url", "thumbnail", "thumb"),
    tags,
    price: str(r, "price", "price_text"),
    store_url: str(r, "store_url", "url", "link"),
    weekly_follows: num(r, "weekly_follows", "follows", "reservations"),
  };
}

export async function loadWeGameTableFromSupabase(table: "wegame_bestseller" | "wegame_purchase" | "wegame_follow"): Promise<{
  games: WgGame[];
  generatedAt: string | null;
} | null> {
  const raw = await fetchAllRowsCached(table, 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const games = sortByRank(batch).map(rowToWg).filter((x): x is WgGame => x != null);
  if (!games.length) return null;
  const generatedAt = str(batch[0]!, "generated_at", "fetched_at", "updated_at", "created_at");
  return { games, generatedAt };
}

function rowToTap(r: Row): TapGame | null {
  const rank = num(r, "rank", "position");
  const title = str(r, "title", "name", "game_name");
  if (rank == null || rank <= 0 || !title) return null;
  return {
    rank,
    title,
    cover_image: str(r, "cover_image", "header_image", "image_url", "thumbnail", "thumb"),
    rating: num(r, "rating", "score"),
    tags: genresFromRow(r),
    price: str(r, "price", "price_text"),
    description: str(r, "description", "desc"),
    store_url: str(r, "store_url", "url", "link"),
    test_status: str(r, "test_status", "status", "phase"),
  };
}

/* ──────────────────────────────────────────
   pc_weekly_news_digest — 每周新闻摘要
   ────────────────────────────────────────── */

export type NewsDigestItem = {
  id: string;
  reportDate: string;
  category: string;
  summary: string;
  sourceTitle: string;
  sourceLink: string | null;
  sourceDate: string | null;
};

export type NewsDigestResult = {
  batchId: string | null;
  categories: Array<{
    category: string;
    items: NewsDigestItem[];
  }>;
};

export async function loadNewsDigestFromSupabase(): Promise<NewsDigestResult | null> {
  const supabase = tryCreateSupabaseServiceClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("pc_weekly_news_digest")
      .select("id,report_date,summary,category,source_title,source_link,source_date,batch_id,created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error || !data?.length) return null;

    const rows = data as unknown as Row[];

    // 取最新一批（按 batch_id 分组，取字典序最大的）
    let maxBatch = "";
    for (const r of rows) {
      const b = str(r, "batch_id") ?? "";
      if (b > maxBatch) maxBatch = b;
    }
    const batch = maxBatch ? rows.filter((r) => str(r, "batch_id") === maxBatch) : rows;

    // 按 category 分组，保持固定顺序
    const categoryOrder = ["平台异动", "厂商异动", "游戏异动", "试玩评测", "独立游戏亮点"];
    const grouped = new Map<string, NewsDigestItem[]>();

    for (const r of batch) {
      const cat = str(r, "category") ?? "其他";
      const item: NewsDigestItem = {
        id: str(r, "id") ?? "",
        reportDate: str(r, "report_date") ?? "",
        category: cat,
        summary: str(r, "summary") ?? "",
        sourceTitle: str(r, "source_title") ?? "",
        sourceLink: str(r, "source_link"),
        sourceDate: str(r, "source_date"),
      };
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(item);
    }

    const categories = categoryOrder
      .filter((c) => grouped.has(c))
      .map((c) => ({ category: c, items: grouped.get(c)! }));

    // 把不在固定顺序里的分类追加到末尾
    for (const [c, items] of grouped) {
      if (!categoryOrder.includes(c)) {
        categories.push({ category: c, items });
      }
    }

    if (!categories.length) return null;
    return { batchId: maxBatch || null, categories };
  } catch {
    return null;
  }
}

export async function loadTapTapTableFromSupabase(table: "taptap_hot_download" | "taptap_test_hot"): Promise<{
  games: TapGame[];
  generatedAt: string | null;
} | null> {
  const raw = await fetchAllRowsCached(table, 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const games = sortByRank(batch).map(rowToTap).filter((x): x is TapGame => x != null);
  if (!games.length) return null;
  const generatedAt = str(batch[0]!, "generated_at", "fetched_at", "updated_at", "created_at");
  return { games, generatedAt };
}

/* ============================================
   entity_topics — 行业新鲜事
   ============================================ */

export interface EntityTopicArticle {
  title: string;
  url: string;
  source: string;
}

export interface EntityTopic {
  id: string;
  entity_type: "game" | "company" | "platform" | "other";
  heat_level: "high" | "mid" | "low";
  entity_name: string;
  /** 从 entity_name 映射出的标准分类标签（如 "Steam"、"Epic"），用于前端显示 */
  display_category: string;
  summary_title: string;
  summary_body: string;
  articles: EntityTopicArticle[];
  /** Supabase entity_score — 用于卡片排序（高分优先） */
  entity_score?: number | null;
  /** Phase 3 — Bangumi API */
  cover_url?: string | null;
  store_url?: string | null;
  store_type?: string | null;
  bangumi_id?: number | null;
  /** LLM 生成的一句话摘要 */
  ai_summary?: string | null;
  /** 服务端从 bangumi_cache 预取的游戏类型标签 */
  bangumi_tags?: string[] | null;
}

/**
 * 将 entity_name 映射到标准分类标签。
 * 关键词匹配优先级：精确前缀 > 包含关键词 > 原名。
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/steam|valve|v社|g胖/i, "Steam"],
  [/epic/i, "Epic"],
  [/ps[456]|playstation|索尼|sony|psv/i, "PlayStation"],
  [/xbox|微软|microsoft/i, "Xbox"],
  [/nintendo|任天堂|switch|马力欧|塞尔达|咚奇/i, "Nintendo"],
  [/顽皮狗|naughty\s*dog/i, "顽皮狗"],
  [/卡普空|capcom/i, "卡普空"],
  [/育碧|ubisoft/i, "育碧"],
  [/暴雪|blizzard/i, "暴雪"],
  [/r星|rockstar/i, "R星"],
  [/ea\b|艺电/i, "EA"],
  [/腾讯|tencent/i, "腾讯"],
  [/网易|netease/i, "网易"],
  [/米哈游|hoyoverse|mihoyo/i, "米哈游"],
  [/dlss|nvidia|英伟达/i, "NVIDIA"],
  [/amd|radeon/i, "AMD"],
  [/苹果|apple|mac/i, "Apple"],
];

function mapEntityCategory(entityName: string): string {
  const name = entityName.trim();
  for (const [re, label] of CATEGORY_RULES) {
    if (re.test(name)) return label;
  }
  // 兜底：原名本身
  return name;
}

export async function loadEntityTopicsFromSupabase(): Promise<EntityTopic[] | null> {
  const supabase = tryCreateSupabaseServiceClient();
  if (!supabase) return null;
  try {
    // period_end 早于当前时间 - 5 天的 entity 不拉取
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("entity_topics")
      .select("id,entity_name,entity_type,entity_level,summary_title,summary_body,articles,period_end,entity_score,ai_summary,created_at")
      .or(`period_end.gte.${fiveDaysAgo},period_end.is.null`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data?.length) return null;

    const rows = data as unknown as Row[];

    const topics = rows.map((r): EntityTopic => {
      // DB articles: { title, link, source, pub_date }
      // Frontend articles: { title, url, source }
      const rawArticles = r.articles;
      const articles: EntityTopicArticle[] = Array.isArray(rawArticles)
        ? rawArticles.map((a: Record<string, unknown>) => ({
            title: String(a.title ?? ""),
            url: String(a.link ?? a.url ?? ""),
            source: String(a.source ?? ""),
          }))
        : [];

      const entityLevel = str(r, "entity_level") ?? "mid";
      const heatLevel = (entityLevel === "high" || entityLevel === "mid" || entityLevel === "low")
        ? entityLevel
        : "mid";

      const entityType = str(r, "entity_type") ?? "other";
      const validType = (entityType === "game" || entityType === "company" || entityType === "platform" || entityType === "other")
        ? entityType
        : "other";

      const rawName = str(r, "entity_name") ?? "";
      const rawScore = (r as Record<string, unknown>).entity_score;
      const rawAiSummary = (r as Record<string, unknown>).ai_summary;
      return {
        id: String(r.id ?? ""),
        entity_type: validType,
        heat_level: heatLevel,
        entity_name: rawName,
        display_category: mapEntityCategory(rawName),
        summary_title: str(r, "summary_title") ?? "",
        summary_body: str(r, "summary_body") ?? "",
        articles,
        entity_score: typeof rawScore === "number" ? rawScore : null,
        ai_summary: typeof rawAiSummary === "string" ? rawAiSummary : null,
        // 预留字段，后面服务端预填充会覆盖
        cover_url: null,
        bangumi_tags: null,
      };
    });

    // ── 服务端预填充封面 ──
    const gameEntities = topics.filter((t) => t.entity_type === "game");
    if (gameEntities.length > 0) {
      const gameNames = gameEntities.map((t) => t.entity_name);
      
      // 1. 先从 bangumi_cache 批量查询已缓存的封面（优先级最高）
      const { data: cachedCovers } = await supabase
        .from("bangumi_cache")
        .select("entity_name,cover_url,tags,platform,store_url,store_type,bangumi_id")
        .in("entity_name", gameNames);
      
      const bangumiCoverMap = new Map<string, { cover_url: string; tags?: string[] | null; platform?: string | null; store_url?: string | null; store_type?: string | null; bangumi_id?: number | null }>();
      if (cachedCovers?.length) {
        for (const row of cachedCovers) {
          if (row.cover_url) {
            bangumiCoverMap.set(row.entity_name, {
              cover_url: row.cover_url,
              tags: row.tags,
              platform: row.platform,
              store_url: row.store_url,
              store_type: row.store_type,
              bangumi_id: row.bangumi_id,
            });
          }
        }
      }
      
      // 2. 对于 Bangumi 没缓存的，用 Steam 封面保底
      const needSteamFallback = gameEntities.filter((t) => !bangumiCoverMap.has(t.entity_name));
      const steamCoverMap = new Map<string, string>();
      if (needSteamFallback.length > 0) {
        const steamResults = await Promise.allSettled(
          needSteamFallback.map(async (t) => {
            const appid = await resolveSteamAppIdByName(t.entity_name);
            return { entity_name: t.entity_name, appid };
          })
        );
        for (const result of steamResults) {
          if (result.status === "fulfilled" && result.value.appid) {
            const { entity_name, appid } = result.value;
            steamCoverMap.set(
              entity_name,
              `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
            );
          }
        }
      }
      
      // 3. 写入 cover_url + store_url：Bangumi > Steam
      for (const t of topics) {
        const bgm = bangumiCoverMap.get(t.entity_name);
        if (bgm) {
          t.cover_url = bgm.cover_url;
          t.bangumi_tags = bgm.tags ?? null;
          t.store_url = bgm.store_url ?? null;
          t.store_type = bgm.store_type ?? null;
          t.bangumi_id = bgm.bangumi_id ?? null;
        } else {
          const steamCover = steamCoverMap.get(t.entity_name);
          if (steamCover) {
            t.cover_url = steamCover;
          }
        }
      }
      
      // DEBUG: 打印服务端预填充结果
      const withCovers = topics.filter(t => t.cover_url);
      console.log(`[loadEntityTopicsFromSupabase] 服务端预填充封面: ${withCovers.length}/${gameEntities.length} 游戏有封面`);
      if (withCovers.length > 0) {
        console.log(`[loadEntityTopicsFromSupabase] 示例: ${withCovers[0]?.entity_name} -> ${withCovers[0]?.cover_url?.substring(0, 50)}...`);
      }
    }

    return topics;
  } catch {
    return null;
  }
}
