export type SteamTopSellersOptions = {
  cc?: string; // Country code, e.g. 'CN'
  l?: string; // Language, e.g. 'schinese'
  count?: number; // desired number of entries
};

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function extractAppIdsFromResultsHtml(resultsHtml: string): number[] {
  // Steam search results embed appid in data-ds-appid, sometimes "123" or "123,456"
  const appIds: number[] = [];
  const re = /data-ds-appid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(resultsHtml))) {
    const raw = match[1] ?? "";
    const first = raw.split(",")[0]?.trim();
    const id = Number(first);
    if (Number.isFinite(id) && id > 0) appIds.push(id);
  }
  return uniq(appIds);
}

export async function fetchSteamTopSellersAppIds(
  options: SteamTopSellersOptions = {},
): Promise<number[]> {
  const cc = (options.cc || "CN").toUpperCase();
  const l = options.l || "schinese";
  const count = Math.max(1, Math.min(options.count ?? 50, 100));

  // This endpoint returns JSON with `results_html`, which we parse for appids.
  const url = new URL("https://store.steampowered.com/search/results/");
  url.searchParams.set("query", "");
  url.searchParams.set("start", "0");
  url.searchParams.set("count", String(Math.max(count, 50)));
  url.searchParams.set("filter", "topsellers");
  url.searchParams.set("os", "win");
  url.searchParams.set("cc", cc);
  url.searchParams.set("l", l);
  url.searchParams.set("infinite", "1");

  const resp = await fetch(url.toString(), {
    headers: {
      // Helps avoid some edge caching quirks
      "accept": "application/json,text/plain,*/*",
      "user-agent": "pc-game-weekly-bot/1.0",
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    throw new Error(`Steam fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { results_html?: string };
  const resultsHtml = data.results_html || "";
  const appIds = extractAppIdsFromResultsHtml(resultsHtml);

  return appIds.slice(0, count);
}

