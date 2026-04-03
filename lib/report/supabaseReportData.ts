import { tryCreateSupabaseServiceClient } from "@/lib/supabase/server";
import type { SteamAppBrief } from "@/lib/steam/appDetails";
import type { EpicChartGame, TapGame, WgGame } from "@/lib/report/localLists";
import { unstable_cache } from "next/cache";

export type Row = Record<string, unknown>;

function num(r: Row, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
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
  | "wegame_bestseller"
  | "wegame_purchase"
  | "wegame_follow"
  | "taptap_hot_download"
  | "taptap_test_hot";

const BASE_TIME_COLS =
  "fetched_at,updated_at,created_at,ingested_at,snapshot_at,batch_at,period_start,fetch_date,generated_at,period_label,week_label,chart_name,source";

const SELECT_COLS: Record<KnownTable, string> = {
  steam_weekly_topsellers: `${BASE_TIME_COLS},rank,position,appid,app_id,steam_appid,name,title,game_name,price_text,price,final_price,current_price,price_cny,current_price_cny,discount_percent,discount,discount_pct,genres,tags,game_genres,rank_delta,rank_change,last_week_rank,prev_rank,is_new,is_new_entry,new_entry,entry_type,badge,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_upcoming_popular: `${BASE_TIME_COLS},rank,position,appid,app_id,steam_appid,name,title,game_name,release_date,release_date_text,coming_date,followers,wishlist_count,follows,genres,tags,game_genres,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_monthly_top_new: `${BASE_TIME_COLS},rank,position,idx,tier,level,badge,category,appid,app_id,steam_appid,name,title,game_name,price_text,price,discount_percent,discount,genres,tags,game_genres,cover_image,header_image,header_image_url,headerImage,capsule_image,capsule_image_url,small_capsule,library_capsule,image_url,image,payload,extra,assets,media`,
  steam_updates_summary: `${BASE_TIME_COLS},title,heading,name,period_label,body,content,summary,text,markdown,description,digest,source_url,url,link,payload`,
  data_4399_summary: `${BASE_TIME_COLS},title,heading,name,period_label,body,content,summary,text,markdown,description,digest,source_url,url,link,payload`,
  epic_top_sellers: `${BASE_TIME_COLS},rank,position,name,title,game_name,current_price_usd,price_usd,current_price,original_price_usd,msrp_usd,discount_percent,discount,weeks_on_chart,weeks,is_free,free,epic_store_url,store_url,url,cover_image,header_image,image_url,thumbnail,thumb`,
  epic_most_played: `${BASE_TIME_COLS},rank,position,name,title,game_name,current_price_usd,price_usd,current_price,original_price_usd,msrp_usd,discount_percent,discount,weeks_on_chart,weeks,is_free,free,epic_store_url,store_url,url,cover_image,header_image,image_url,thumbnail,thumb`,
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
  let rankDelta = num(r, "rank_delta", "rank_change");
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
    rankDelta: rankDelta ?? null,
    isNewEntry: !!isNew,
  };
}

export async function loadSteamWeeklyTopsellersFromSupabase(): Promise<{
  meta: { label: string | null };
  items: SteamWeeklyDbItem[];
  newEntries: SteamWeeklyDbItem[];
  moversUp: SteamWeeklyDbItem[];
  moversDown: SteamWeeklyDbItem[];
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
  const moversDown = [...movers].sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0)).slice(0, 5);
  const label = str(batch[0]!, "period_label", "week_label", "chart_name", "source") ?? null;
  return { meta: { label }, items, newEntries, moversUp, moversDown };
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

export async function loadSteamUpcomingPopularFromSupabase(): Promise<{ items: SteamUpcomingDbItem[] } | null> {
  const raw = await fetchAllRowsCached("steam_upcoming_popular", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const items = sortByRank(batch).map(rowToSteamUpcoming).filter((x): x is SteamUpcomingDbItem => x != null);
  if (!items.length) return null;
  return { items };
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

export async function loadSteamMonthlyTopNewFromSupabase(): Promise<{ items: SteamNewDbItem[] } | null> {
  const raw = await fetchAllRowsCached("steam_monthly_top_new", 800);
  if (!raw.length) return null;
  const batch = pickLatestBatch(raw);
  const items = sortByRank(batch).map(rowToSteamNew).filter((x): x is SteamNewDbItem => x != null);
  if (!items.length) return null;
  return { items };
}

/** 周报页合并一次 appdetails 结果，避免三块数据各打一遍 Steam */
export function attachSteamAppBriefToWeeklyReport(
  report: {
    meta: { label: string | null };
    items: SteamWeeklyDbItem[];
    newEntries: SteamWeeklyDbItem[];
    moversUp: SteamWeeklyDbItem[];
    moversDown: SteamWeeklyDbItem[];
  },
  map: Map<number, SteamAppBrief>,
): {
  meta: { label: string | null };
  items: SteamWeeklyDbItem[];
  newEntries: SteamWeeklyDbItem[];
  moversUp: SteamWeeklyDbItem[];
  moversDown: SteamWeeklyDbItem[];
} {
  const merged = report.items.map((it) => (it.appid ? mergeSteamBriefWeekly(it, map.get(it.appid)) : it));
  const newEntries = merged.filter((it) => it.isNewEntry);
  const movers = merged.filter((it) => typeof it.rankDelta === "number" && it.rankDelta !== 0);
  const moversUp = [...movers].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 5);
  const moversDown = [...movers].sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0)).slice(0, 5);
  return { ...report, items: merged, newEntries, moversUp, moversDown };
}

export function attachSteamAppBriefToUpcoming(
  data: { items: SteamUpcomingDbItem[] },
  map: Map<number, SteamAppBrief>,
): { items: SteamUpcomingDbItem[] } {
  return {
    items: data.items.map((it) => (it.appid ? mergeSteamBriefUpcoming(it, map.get(it.appid)) : it)),
  };
}

export function attachSteamAppBriefToMonthlyNew(
  data: { items: SteamNewDbItem[] },
  map: Map<number, SteamAppBrief>,
): { items: SteamNewDbItem[] } {
  return {
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

function rowToEpicGame(r: Row): EpicChartGame | null {
  const rank = num(r, "rank", "position");
  const name = str(r, "name", "title", "game_name");
  if (rank == null || rank <= 0 || !name) return null;
  return {
    rank,
    name,
    cover_image: str(r, "cover_image", "header_image", "image_url", "thumbnail", "thumb"),
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
