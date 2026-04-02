import { readFile } from "node:fs/promises";
import { fetchSteamAppsBrief, type SteamAppBrief } from "@/lib/steam/appDetails";
import { resolveSteamAppIdByName } from "@/lib/steam/resolveAppId";

export type SteamMdTopSellerRow = {
  rank: number;
  name: string;
  priceText: string;
  discountPercent: number | null;
  rankChangeText: string;
  weeksOnChart: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

export type SteamMdUpcomingRow = {
  rank: number;
  name: string;
  releaseDateText: string;
  priceText: string;
  discountPercent: number | null;
  followers: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

export type SteamMdNewReleaseRow = {
  tier: "gold" | "silver";
  name: string;
  priceText: string;
  discountPercent: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

export type SteamMdPromoRow = {
  rank: number;
  name: string;
  discountText: string;
  finalPriceText: string;
  // Prefer appdetails if resolvable.
  priceText: string;
  discountPercent: number | null;
  appid: number | null;
  headerImage: string | null;
  genres: string[];
};

export type SteamMdReport = {
  periodText: string | null;
  generatedDateText: string | null;
  topSellers: SteamMdTopSellerRow[];
  upcoming: SteamMdUpcomingRow[];
  newReleases: SteamMdNewReleaseRow[];
  promos: SteamMdPromoRow[];
};

function stripMdBold(s: string) {
  return s.replace(/\*\*(.*?)\*\*/g, "$1");
}

function parseMdLink(cell: string): { text: string; url: string | null } {
  const m = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!m) return { text: cell.trim(), url: null };
  return { text: m[1]!.trim(), url: m[2]!.trim() };
}

function extractSteamAppId(url: string | null): number | null {
  if (!url) return null;
  const m = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseIntLoose(s: string): number | null {
  const v = s.replace(/[, ]/g, "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseMarkdownTable(md: string, headerStartsWith: string): string[][] {
  const idx = md.indexOf(headerStartsWith);
  if (idx < 0) return [];

  const slice = md.slice(idx);
  const lines = slice.split("\n");

  const headerLine = lines.findIndex((l) => l.trim().startsWith("|"));
  if (headerLine < 0) return [];

  // read until blank line or non-table
  const tableLines: string[] = [];
  for (let i = headerLine; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (!l.trim().startsWith("|")) break;
    tableLines.push(l);
  }
  if (tableLines.length < 3) return [];

  // drop header + align line
  const body = tableLines.slice(2);
  const rows = body
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  return rows;
}

function applyBrief<
  T extends {
    appid: number | null;
    headerImage: string | null;
    genres: string[];
    name: string;
    priceText: string;
    discountPercent?: number | null;
  },
>(rows: T[], briefByApp: Map<number, SteamAppBrief>): T[] {
  return rows.map((r) => {
    if (!r.appid) return r;
    const b = briefByApp.get(r.appid);
    if (!b) return r;
    return {
      ...r,
      // Steam fields prefer appdetails as source of truth.
      name: b.name ?? r.name,
      headerImage: b.headerImage ?? r.headerImage,
      genres: b.genres ?? r.genres,
      priceText: b.priceText ?? r.priceText,
      discountPercent: b.discountPercent ?? r.discountPercent ?? null,
    };
  });
}

async function resolveMissingAppIds<T extends { appid: number | null; name: string }>(rows: T[], cc: string): Promise<T[]> {
  // Best-effort: resolve appid via Steam search for rows without appid.
  // Keep it conservative to avoid hammering Steam.
  const out: T[] = [];
  let attempts = 0;
  for (const r of rows) {
    if (r.appid) {
      out.push(r);
      continue;
    }
    if (attempts >= 20) {
      out.push(r);
      continue;
    }
    attempts += 1;
    try {
      const appid = await resolveSteamAppIdByName(r.name, { cc, l: "schinese" });
      out.push({ ...r, appid: appid ?? null });
    } catch {
      out.push(r);
    }
  }
  return out;
}

export async function loadSteamMdReport(options: { cc?: string } = {}): Promise<SteamMdReport | null> {
  const cc = (options.cc || "CN").toUpperCase();
  const mdPath = process.cwd() + "/data/PC游戏行业周报_20260401.md";

  let md: string;
  try {
    md = await readFile(mdPath, "utf8");
  } catch {
    return null;
  }

  const periodText =
    md.match(/\*\*报告周期\*\*：([^\n]+)/)?.[1]?.trim() ??
    md.match(/报告周期：([^\n]+)/)?.[1]?.trim() ??
    null;
  const generatedDateText =
    md.match(/\*\*生成时间\*\*：([^\n]+)/)?.[1]?.trim() ??
    md.match(/生成时间：([^\n]+)/)?.[1]?.trim() ??
    null;

  // 1.1 weekly top sellers table
  const topSellerRowsRaw = parseMarkdownTable(md, "### 1.1");
  const topSellers: SteamMdTopSellerRow[] = topSellerRowsRaw
    .map((cells) => {
      // | 排名 | 游戏 | 价格 | 排名变化 | 上榜周数 |
      const rank = Number(cells[0]);
      const gameCell = cells[1] ?? "";
      const priceText = stripMdBold(cells[2] ?? "—");
      const rankChangeText = stripMdBold(cells[3] ?? "—");
      const weeksOnChart = parseIntLoose(stripMdBold(cells[4] ?? "")) ?? null;

      const { text, url } = parseMdLink(gameCell);
      const name = stripMdBold(text);
      const appid = extractSteamAppId(url);

      if (!Number.isFinite(rank) || rank <= 0) return null;
      const row: SteamMdTopSellerRow = {
        rank,
        name,
        priceText,
        discountPercent: null,
        rankChangeText,
        weeksOnChart,
        appid,
        headerImage: null,
        genres: [],
      };
      return row;
    })
    .filter((v): v is SteamMdTopSellerRow => v != null);

  // 1.2 upcoming table (Top 50 in md, we only use those present)
  const upcomingRowsRaw = parseMarkdownTable(md, "### 1.2");
  const upcoming: SteamMdUpcomingRow[] = upcomingRowsRaw
    .map((cells) => {
      // | # | 游戏 | 发售日 | 价格 | Followers |
      const rank = Number(cells[0]);
      const { text, url } = parseMdLink(cells[1] ?? "");
      const name = stripMdBold(text);
      const releaseDateText = stripMdBold(cells[2] ?? "—");
      const priceText = stripMdBold(cells[3] ?? "—");
      const followers = parseIntLoose(stripMdBold(cells[4] ?? "")) ?? null;
      const appid = extractSteamAppId(url);
      if (!Number.isFinite(rank) || rank <= 0) return null;
      const row: SteamMdUpcomingRow = {
        rank,
        name,
        releaseDateText,
        priceText,
        discountPercent: null,
        followers,
        appid,
        headerImage: null,
        genres: [],
      };
      return row;
    })
    .filter((v): v is SteamMdUpcomingRow => v != null)
    .slice(0, 50);

  // 1.3 new releases: gold + silver tables
  const goldRaw = parseMarkdownTable(md, "**🟡 黄金级");
  const silverRaw = parseMarkdownTable(md, "**⚪ 白银级");

  const parseNewReleaseRows = (tier: "gold" | "silver", rows: string[][]): SteamMdNewReleaseRow[] =>
    rows
      .map((cells) => {
        const gameCell = cells[0] ?? "";
        const priceText = stripMdBold(cells[1] ?? "—");
        const { text, url } = parseMdLink(gameCell);
        const name = stripMdBold(text);
        const appid = extractSteamAppId(url);
        if (!name) return null;
        const row: SteamMdNewReleaseRow = { tier, name, priceText, discountPercent: null, appid, headerImage: null, genres: [] };
        return row;
      })
      .filter((v): v is SteamMdNewReleaseRow => v != null);

  const newReleasesBase = [...parseNewReleaseRows("gold", goldRaw), ...parseNewReleaseRows("silver", silverRaw)];

  // 1.4 promos table
  const promoRaw = parseMarkdownTable(md, "热门作品 Top 10");
  const promos: SteamMdPromoRow[] = promoRaw
    .map((cells) => {
      // | # | 游戏 | 折扣 | 折后价 |
      const rank = Number(cells[0]);
      const gameCell = cells[1] ?? "";
      const discountText = stripMdBold(cells[2] ?? "—");
      const finalPriceText = stripMdBold(cells[3] ?? "—");
      const { text, url } = parseMdLink(gameCell);
      const name = stripMdBold(text);
      const appid = extractSteamAppId(url);
      if (!Number.isFinite(rank) || rank <= 0) return null;
      const row: SteamMdPromoRow = {
        rank,
        name,
        discountText,
        finalPriceText,
        priceText: finalPriceText,
        discountPercent: null,
        appid,
        headerImage: null,
        genres: [],
      };
      return row;
    })
    .filter((v): v is SteamMdPromoRow => v != null)
    .slice(0, 10);

  const [topSellersWithIds, newReleasesWithIds, promosWithIds] = await Promise.all([
    resolveMissingAppIds(topSellers, cc),
    resolveMissingAppIds(newReleasesBase, cc),
    resolveMissingAppIds(promos, cc),
  ]);

  // Enrich with Steam appdetails. Do ONE consolidated fetch to avoid rate limiting.
  const allAppIds = Array.from(
    new Set(
      [...topSellersWithIds, ...upcoming, ...newReleasesWithIds, ...promosWithIds]
        .map((r) => r.appid)
        .filter((v): v is number => typeof v === "number" && v > 0),
    ),
  );
  const briefByApp = allAppIds.length ? await fetchSteamAppsBrief(allAppIds, { cc }) : new Map<number, SteamAppBrief>();

  const topSellersE = applyBrief(topSellersWithIds, briefByApp);
  const upcomingE = applyBrief(upcoming, briefByApp);
  const newReleasesE = applyBrief(newReleasesWithIds, briefByApp);
  const promosE = applyBrief(promosWithIds, briefByApp);

  return {
    periodText,
    generatedDateText,
    topSellers: topSellersE,
    upcoming: upcomingE,
    newReleases: newReleasesE,
    promos: promosE,
  };
}

