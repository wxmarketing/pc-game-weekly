export type SteamAppBrief = {
  appid: number;
  name: string | null;
  priceText: string | null;
  discountPercent: number | null;
  headerImage: string | null;
  genres: string[];
  developers: string[];
  publishers: string[];
};

type SteamAppDetailsInner = {
  success: boolean;
  data?: {
    name?: string;
    header_image?: string;
    genres?: Array<{ id?: string; description?: string }>;
    developers?: string[];
    publishers?: string[];
    is_free?: boolean;
    price_overview?: {
      final?: number;
      final_formatted?: string;
      discount_percent?: number;
      currency?: string;
    };
  };
};

function formatPriceFallback(finalPriceCent?: number, currency?: string) {
  if (typeof finalPriceCent !== "number") return null;
  const value = (finalPriceCent / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}

export async function fetchSteamAppsBrief(
  appids: number[],
  options: { cc?: string; l?: string } = {},
): Promise<Map<number, SteamAppBrief>> {
  const cc = (options.cc || "CN").toUpperCase();
  const l = options.l || "schinese";

  const result = new Map<number, SteamAppBrief>();
  const uniqAppids = Array.from(new Set(appids.filter((id) => Number.isFinite(id) && id > 0)));

  if (uniqAppids.length === 0) return result;

  // NOTE: Steam appdetails does NOT accept comma-separated appids (400).
  // 并发过高 + 同页多次并行拉取容易触发限流；并发宜低，并带 429/503 退避重试。
  const concurrency = 3;
  let cursor = 0;

  async function sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
  }

  async function fetchAppDetailsPayload(appid: number, params: { cc?: string; l?: string }) {
    const endpoint = new URL("https://store.steampowered.com/api/appdetails");
    endpoint.searchParams.set("appids", String(appid));
    if (params.cc) endpoint.searchParams.set("cc", params.cc);
    if (params.l) endpoint.searchParams.set("l", params.l);

    const url = endpoint.toString();
    const maxAttempts = 4;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await fetch(url, {
          cache: "no-store",
          headers: { "user-agent": "pc-game-weekly-bot/1.0", accept: "application/json" },
        });
        if (resp.status === 429 || resp.status === 503 || resp.status === 502) {
          await sleep(350 * attempt);
          continue;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = (await resp.json()) as Record<string, SteamAppDetailsInner>;
        return payload[String(appid)];
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts) await sleep(250 * attempt);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("fetch appdetails failed");
  }

  async function fetchOne(appid: number) {
    // Some apps return {success:false} under certain countries (e.g. CN store unavailable).
    // We progressively fall back to less strict contexts to at least get name/image/genres.
    const attempts = [
      { cc, l },
      { l },
      {},
    ] as Array<{ cc?: string; l?: string }>;

    let item: SteamAppDetailsInner | undefined;
    for (const params of attempts) {
      const got = await fetchAppDetailsPayload(appid, params);
      if (got?.success) {
        item = got;
        break;
      }
    }

    if (!item?.success) throw new Error("Steam appdetails success=false");
    const data = item?.data;

    const isFree = data?.is_free === true;
    const finalFormatted = data?.price_overview?.final_formatted ?? null;
    const finalCent = data?.price_overview?.final;
    const currency = data?.price_overview?.currency;

    result.set(appid, {
      appid,
      name: data?.name ?? null,
      priceText: isFree ? "免费开玩" : finalFormatted || formatPriceFallback(finalCent, currency),
      discountPercent:
        typeof data?.price_overview?.discount_percent === "number"
          ? data.price_overview.discount_percent
          : null,
      headerImage: data?.header_image ?? null,
      genres: (data?.genres ?? [])
        .map((g) => g.description?.trim())
        .filter((v): v is string => Boolean(v))
        .slice(0, 4),
      developers: (data?.developers ?? []).filter((v): v is string => Boolean(v)).slice(0, 3),
      publishers: (data?.publishers ?? []).filter((v): v is string => Boolean(v)).slice(0, 3),
    });
  }

  async function worker() {
    while (cursor < uniqAppids.length) {
      const idx = cursor++;
      const appid = uniqAppids[idx]!;
      try {
        await fetchOne(appid);
      } catch {
        result.set(appid, {
          appid,
          name: null,
          priceText: null,
          discountPercent: null,
          headerImage: null,
          genres: [],
          developers: [],
          publishers: [],
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqAppids.length) }, () => worker()));

  return result;
}

