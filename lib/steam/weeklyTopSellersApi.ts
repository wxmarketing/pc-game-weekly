export type SteamWeeklyTopSellerRow = {
  rank: number;
  appid: number;
  lastWeekRank: number | null;
};

export type SteamWeeklyTopSellers = {
  countryCode: string | null;
  startDate: number | null; // unix seconds (week start)
  rows: SteamWeeklyTopSellerRow[];
};

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function fetchSteamWeeklyTopSellers(options: {
  countryCode?: string; // e.g. "CN"
  count?: number; // default 10
  startDate?: number; // unix seconds, optional
}): Promise<SteamWeeklyTopSellers> {
  const key = mustGetEnv("STEAM_WEB_API_KEY");
  const countryCode = options.countryCode ? options.countryCode.toUpperCase() : null;
  const count = Math.max(1, Math.min(options.count ?? 10, 100));

  const url = new URL("https://api.steampowered.com/IStoreTopSellersService/GetWeeklyTopSellers/v1/");
  url.searchParams.set("key", key);
  if (countryCode) url.searchParams.set("country_code", countryCode);
  url.searchParams.set("page_start", "0");
  url.searchParams.set("page_count", String(count));
  if (typeof options.startDate === "number" && Number.isFinite(options.startDate) && options.startDate > 0) {
    url.searchParams.set("start_date", String(Math.floor(options.startDate)));
  }

  const resp = await fetch(url.toString(), {
    headers: { "user-agent": "pc-game-weekly/1.0" },
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`Steam weekly topsellers failed: ${resp.status} ${resp.statusText}`);
  }
  const json = (await resp.json()) as any;

  const response = json?.response ?? null;
  const rowsRaw: any[] = Array.isArray(response?.ranks) ? response.ranks : Array.isArray(response?.rows) ? response.rows : [];
  const rows: SteamWeeklyTopSellerRow[] = rowsRaw
    .map((r) => ({
      rank: Number(r?.rank),
      appid: Number(r?.appid),
      lastWeekRank: typeof r?.last_week_rank === "number" ? r.last_week_rank : null,
    }))
    .filter((r) => Number.isFinite(r.rank) && r.rank > 0 && Number.isFinite(r.appid) && r.appid > 0)
    .slice(0, count);

  if (rows.length === 0) {
    throw new Error("Steam weekly topsellers returned empty response");
  }

  const startDate =
    typeof response?.start_date === "number"
      ? response.start_date
      : typeof response?.startDate === "number"
        ? response.startDate
        : null;

  return { countryCode, startDate, rows };
}

