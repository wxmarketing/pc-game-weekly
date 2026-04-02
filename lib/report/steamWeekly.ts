import { fetchSteamAppsBrief } from "@/lib/steam/appDetails";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchSteamWeeklyTopSellers } from "@/lib/steam/weeklyTopSellersApi";

type SnapshotRow = {
  id: string;
  captured_at: string;
};

type SnapshotItemRow = {
  snapshot_id: string;
  rank: number;
  appid: number;
};

export type SteamWeeklyItem = {
  appid: number;
  rank: number;
  rankDelta: number | null;
  isNewEntry: boolean;
  name: string | null;
  priceText: string | null;
  discountPercent: number | null;
  headerImage: string | null;
  genres: string[];
};

export type SteamWeeklyReport = {
  countryCode: string;
  windowDays: number;
  startCapturedAt: string;
  endCapturedAt: string;
  top: SteamWeeklyItem[];
  newEntries: SteamWeeklyItem[];
  moversUp: SteamWeeklyItem[];
  moversDown: SteamWeeklyItem[];
};

export async function buildSteamWeeklyTopSellersReport(options: {
  cc?: string;
  days?: number;
  limit?: number;
}): Promise<SteamWeeklyReport | null> {
  const cc = (options.cc || "CN").toUpperCase();
  const days = Math.max(2, Math.min(options.days ?? 7, 30));
  const limit = Math.max(10, Math.min(options.limit ?? 20, 50));

  // Prefer Steam Web API weekly topsellers when key is available.
  if (process.env.STEAM_WEB_API_KEY) {
    try {
      const weekly = await fetchSteamWeeklyTopSellers({ countryCode: cc, count: limit });
      const appIds = weekly.rows.map((r) => r.appid);
      const brief = await fetchSteamAppsBrief(appIds, { cc });

      const items: SteamWeeklyItem[] = weekly.rows.map((r) => {
        const b = brief.get(r.appid);
        return {
          appid: r.appid,
          rank: r.rank,
          rankDelta: typeof r.lastWeekRank === "number" && r.lastWeekRank > 0 ? r.lastWeekRank - r.rank : null,
          isNewEntry: r.lastWeekRank === -1,
          name: b?.name ?? null,
          priceText: b?.priceText ?? null,
          discountPercent: b?.discountPercent ?? null,
          headerImage: b?.headerImage ?? null,
          genres: b?.genres ?? [],
        };
      });

      const newEntries = items.filter((it) => it.isNewEntry);
      const movers = items.filter((it) => typeof it.rankDelta === "number" && it.rankDelta !== 0);
      const moversUp = [...movers].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 5);
      const moversDown = [...movers].sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0)).slice(0, 5);

      const endIso = new Date().toISOString();
      const startIso = weekly.startDate ? new Date(weekly.startDate * 1000).toISOString() : endIso;

      return {
        countryCode: cc,
        windowDays: 7,
        startCapturedAt: startIso,
        endCapturedAt: endIso,
        top: items,
        newEntries,
        moversUp,
        moversDown,
      };
    } catch {
      // fall back to snapshot mode
    }
  }

  const supabase = tryCreateSupabaseServiceClient();
  if (!supabase) return null;

  try {
    const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: snaps, error: sErr } = await supabase
      .from("steam_rank_snapshots")
      .select("id,captured_at")
      .eq("list_type", "top_sellers")
      .eq("country_code", cc)
      .gte("captured_at", startIso)
      .order("captured_at", { ascending: true });

    if (sErr) return null;
    const snapshots = (snaps ?? []) as SnapshotRow[];
    if (snapshots.length < 2) return null;

    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;
    const ids = snapshots.map((s) => s.id);

    const { data: allItems, error: iErr } = await supabase
      .from("steam_rank_snapshot_items")
      .select("snapshot_id,rank,appid")
      .in("snapshot_id", ids);
    if (iErr) return null;

    const rows = (allItems ?? []) as SnapshotItemRow[];
    const firstRankByApp = new Map<number, number>();
    const lastRankByApp = new Map<number, number>();
    for (const r of rows) {
      if (r.snapshot_id === first.id) firstRankByApp.set(r.appid, r.rank);
      if (r.snapshot_id === last.id) lastRankByApp.set(r.appid, r.rank);
    }

    const lastTop = rows
      .filter((r) => r.snapshot_id === last.id)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit);

    const appIds = lastTop.map((r) => r.appid);
    let brief: Awaited<ReturnType<typeof fetchSteamAppsBrief>>;
    try {
      brief = await fetchSteamAppsBrief(appIds, { cc });
    } catch {
      brief = new Map();
    }

    const items: SteamWeeklyItem[] = lastTop.map((r) => {
      const firstRank = firstRankByApp.get(r.appid) ?? null;
      const rankDelta = firstRank == null ? null : firstRank - r.rank;
      const b = brief.get(r.appid);
      return {
        appid: r.appid,
        rank: r.rank,
        rankDelta,
        isNewEntry: firstRank == null,
        name: b?.name ?? null,
        priceText: b?.priceText ?? null,
        discountPercent: b?.discountPercent ?? null,
        headerImage: b?.headerImage ?? null,
        genres: b?.genres ?? [],
      };
    });

    const newEntries = items.filter((it) => it.isNewEntry);
    const movers = items.filter((it) => typeof it.rankDelta === "number" && it.rankDelta !== 0);
    const moversUp = [...movers].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)).slice(0, 5);
    const moversDown = [...movers]
      .sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0))
      .slice(0, 5);

    return {
      countryCode: cc,
      windowDays: days,
      startCapturedAt: first.captured_at,
      endCapturedAt: last.captured_at,
      top: items,
      newEntries,
      moversUp,
      moversDown,
    };
  } catch {
    return null;
  }
}

