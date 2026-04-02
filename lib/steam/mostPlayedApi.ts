export type SteamMostPlayedRow = {
  rank: number;
  appid: number;
  concurrentInGame: number | null;
  peakInGame: number | null;
};

export type SteamMostPlayed = {
  countryCode: string | null;
  rows: SteamMostPlayedRow[];
};

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function fetchSteamMostPlayed(options: {
  countryCode?: string; // e.g. "CN"
  count?: number; // default 10
}): Promise<SteamMostPlayed> {
  const key = mustGetEnv("STEAM_WEB_API_KEY");
  const countryCode = options.countryCode ? options.countryCode.toUpperCase() : null;
  const count = Math.max(1, Math.min(options.count ?? 10, 100));

  const url = new URL("https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/");
  url.searchParams.set("key", key);
  if (countryCode) url.searchParams.set("country_code", countryCode);
  url.searchParams.set("page_start", "0");
  url.searchParams.set("page_count", String(count));

  const resp = await fetch(url.toString(), {
    headers: { "user-agent": "pc-game-weekly/1.0" },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Steam most played failed: ${resp.status} ${resp.statusText}`);
  const json = (await resp.json()) as any;
  const response = json?.response ?? null;

  const rowsRaw: any[] = Array.isArray(response?.ranks)
    ? response.ranks
    : Array.isArray(response?.rows)
      ? response.rows
      : [];

  const rows: SteamMostPlayedRow[] = rowsRaw
    .map((r) => ({
      rank: Number(r?.rank),
      appid: Number(r?.appid),
      concurrentInGame: typeof r?.concurrent_in_game === "number" ? r.concurrent_in_game : null,
      peakInGame: typeof r?.peak_in_game === "number" ? r.peak_in_game : null,
    }))
    .filter((r) => Number.isFinite(r.rank) && r.rank > 0 && Number.isFinite(r.appid) && r.appid > 0)
    .slice(0, count);

  if (rows.length === 0) throw new Error("Steam most played returned empty response");
  return { countryCode, rows };
}

