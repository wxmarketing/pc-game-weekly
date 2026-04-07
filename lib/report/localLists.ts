import { readFile } from "node:fs/promises";

export type LocalListMeta = {
  generatedAt?: string | null;
  fetchDate?: string | null;
  platform?: string | null;
  chart?: string | null;
  sourceUrl?: string | null;
};

export type EpicChartGame = {
  rank: number;
  name: string;
  cover_image: string | null;
  current_price_usd: number | null;
  original_price_usd: number | null;
  discount_percent: number | null;
  weeks_on_chart: number | null;
  is_free: boolean | null;
  epic_store_url: string | null;
};

export type EpicUpcomingGame = {
  rank: number;
  title: string;
  tags: string[];
  price: string | null;
  rating: number | null;
  description: string | null;
  store_url: string | null;
  cover_image: string | null;
  developer: string | null;
};

export type WgGame = {
  rank: number;
  title: string;
  cover_image: string | null;
  tags: string[];
  price: string | null;
  store_url: string | null;
  weekly_follows: number | null;
};

export type TapGame = {
  rank: number;
  title: string;
  cover_image: string | null;
  rating: number | null;
  tags: string[];
  price: string | null;
  description: string | null;
  store_url: string | null;
  test_status: string | null;
};

async function readJsonFile(pathFromProjectRoot: string): Promise<any | null> {
  try {
    const raw = await readFile(process.cwd() + pathFromProjectRoot, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: any): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function arrStr(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
}

function stripTitleWrappers(input: string): string {
  let s = input.trim();
  const open = new Set(["《", "「", "『", "“", "\"", "'", "【", "[", "(", "（"]);
  const close = new Set(["》", "」", "』", "”", "\"", "'", "】", "]", ")", "）"]);
  while (s.length >= 2 && open.has(s[0]!) && close.has(s[s.length - 1]!)) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export async function loadEpicCharts(): Promise<{
  meta: LocalListMeta;
  topSellers: EpicChartGame[];
  mostPlayed: EpicChartGame[];
} | null> {
  const j = await readJsonFile("/data/epic_charts.json");
  if (!j?.charts) return null;

  const top = j.charts?.top_sellers;
  const mp = j.charts?.most_played;
  const topGamesRaw: any[] = Array.isArray(top?.games) ? top.games : [];
  const mpGamesRaw: any[] = Array.isArray(mp?.games) ? mp.games : [];

  const mapGame = (g: any): EpicChartGame | null => {
    const rank = Number(g?.rank);
    const name = strOrNull(g?.name);
    if (!Number.isFinite(rank) || rank <= 0 || !name) return null;
    return {
      rank,
      name: stripTitleWrappers(name),
      cover_image: strOrNull(g?.cover_image ?? g?.header_image ?? g?.image_url),
      current_price_usd: g?.current_price_usd == null ? null : numOrNull(g.current_price_usd),
      original_price_usd: g?.original_price_usd == null ? null : numOrNull(g.original_price_usd),
      discount_percent: g?.discount_percent == null ? null : numOrNull(g.discount_percent),
      weeks_on_chart: g?.weeks_on_chart == null ? null : numOrNull(g.weeks_on_chart),
      is_free: typeof g?.is_free === "boolean" ? g.is_free : null,
      epic_store_url: strOrNull(g?.epic_store_url),
    };
  };

  return {
    meta: {
      platform: strOrNull(j?.platform),
      fetchDate: strOrNull(j?.fetch_date),
      sourceUrl: strOrNull(top?.source_url) ?? strOrNull(mp?.source_url) ?? null,
    },
    topSellers: topGamesRaw.map(mapGame).filter((x): x is EpicChartGame => Boolean(x)),
    mostPlayed: mpGamesRaw.map(mapGame).filter((x): x is EpicChartGame => Boolean(x)),
  };
}

export async function loadEpicUpcoming(): Promise<{ meta: LocalListMeta; games: EpicUpcomingGame[] } | null> {
  const j = await readJsonFile("/data/epic_upcoming.json");
  const raw: any[] = Array.isArray(j?.games) ? j.games : [];
  const games: EpicUpcomingGame[] = raw
    .map((g) => {
      const rank = Number(g?.rank);
      const title = strOrNull(g?.title);
      if (!Number.isFinite(rank) || rank <= 0 || !title) return null;
      return {
        rank,
        title,
        tags: arrStr(g?.tags),
        price: strOrNull(g?.price),
        rating: g?.rating == null ? null : numOrNull(g.rating),
        description: strOrNull(g?.description),
        store_url: strOrNull(g?.store_url),
        cover_image: strOrNull(g?.cover_image),
        developer: strOrNull(g?.developer),
      };
    })
    .filter((x): x is EpicUpcomingGame => Boolean(x));

  return {
    meta: {
      platform: strOrNull(j?.platform),
      generatedAt: strOrNull(j?.generated_at),
      chart: strOrNull(j?.chart),
    },
    games,
  };
}

export async function loadWeGameList(which: "bestseller" | "purchase" | "follow"): Promise<{
  meta: LocalListMeta;
  games: WgGame[];
} | null> {
  const file =
    which === "bestseller"
      ? "/data/wegame_bestseller.json"
      : which === "purchase"
        ? "/data/wegame_purchase.json"
        : "/data/wegame_follow.json";
  const j = await readJsonFile(file);
  const raw: any[] = Array.isArray(j?.games) ? j.games : [];

  const mapped = raw.map((g) => {
    const rank = Number(g?.rank);
    const title = strOrNull(g?.title);
    if (!Number.isFinite(rank) || rank <= 0 || !title) return null;
    return {
      rank,
      title,
      cover_image: strOrNull(g?.cover_image ?? g?.header_image ?? g?.image_url),
      tags: arrStr(g?.tags),
      price: strOrNull(g?.price),
      store_url: strOrNull(g?.store_url),
      weekly_follows: g?.weekly_follows == null ? null : numOrNull(g.weekly_follows),
    };
  });
  const games = mapped.filter((x): x is WgGame => x != null);

  return {
    meta: {
      platform: strOrNull(j?.platform),
      generatedAt: strOrNull(j?.generated_at),
      chart: strOrNull(j?.chart),
    },
    games,
  };
}

export async function loadTapTapList(which: "hot_download" | "test_hot"): Promise<{
  meta: LocalListMeta;
  games: TapGame[];
} | null> {
  const file = which === "hot_download" ? "/data/taptap_hot_download.json" : "/data/taptap_test_hot.json";
  const j = await readJsonFile(file);
  const raw: any[] = Array.isArray(j?.games) ? j.games : [];

  const tapMapped = raw.map((g) => {
    const rank = Number(g?.rank);
    const title = strOrNull(g?.title);
    if (!Number.isFinite(rank) || rank <= 0 || !title) return null;
    return {
      rank,
      title,
      cover_image: strOrNull(g?.cover_image ?? g?.header_image ?? g?.image_url),
      rating: g?.rating == null ? null : numOrNull(g.rating),
      tags: arrStr(g?.tags),
      price: strOrNull(g?.price),
      description: strOrNull(g?.description),
      store_url: strOrNull(g?.store_url),
      test_status: strOrNull(g?.test_status),
    };
  });
  const games = tapMapped.filter((x): x is TapGame => x != null);

  return {
    meta: {
      platform: strOrNull(j?.platform),
      generatedAt: strOrNull(j?.generated_at),
      chart: strOrNull(j?.chart),
    },
    games,
  };
}

