export type SteamNewsItem = {
  gid: string;
  title: string;
  url: string;
  isExternalUrl: boolean;
  author: string | null;
  contents: string | null;
  feedlabel: string | null;
  date: number; // unix seconds
};

export async function fetchSteamNewsForApp(options: {
  appid: number;
  count?: number;
  maxLength?: number;
}): Promise<SteamNewsItem[]> {
  const count = Math.max(1, Math.min(options.count ?? 10, 50));
  const maxLength = Math.max(0, Math.min(options.maxLength ?? 0, 5000));

  const url = new URL("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/");
  url.searchParams.set("appid", String(options.appid));
  url.searchParams.set("count", String(count));
  url.searchParams.set("maxlength", String(maxLength));
  url.searchParams.set("format", "json");

  const resp = await fetch(url.toString(), {
    headers: { "user-agent": "pc-game-weekly/1.0" },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`Steam news failed: ${resp.status} ${resp.statusText}`);
  const json = (await resp.json()) as any;

  const itemsRaw: any[] = Array.isArray(json?.appnews?.newsitems) ? json.appnews.newsitems : [];
  return itemsRaw
    .map((it) => ({
      gid: String(it?.gid ?? ""),
      title: String(it?.title ?? ""),
      url: String(it?.url ?? ""),
      isExternalUrl: Boolean(it?.is_external_url),
      author: typeof it?.author === "string" ? it.author : null,
      contents: typeof it?.contents === "string" ? it.contents : null,
      feedlabel: typeof it?.feedlabel === "string" ? it.feedlabel : null,
      date: Number(it?.date ?? 0),
    }))
    .filter((it) => it.gid && it.title && it.url && Number.isFinite(it.date) && it.date > 0)
    .slice(0, count);
}

