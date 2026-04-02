import { fetchSteamAppsBrief } from "@/lib/steam/appDetails";
import { fetchSteamTopSellersAppIds } from "@/lib/steam/topSellers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SnapshotRow = {
  id: string;
  captured_at: string;
  list_type: string;
  country_code: string;
};

type SnapshotItemRow = {
  snapshot_id: string;
  rank: number;
  appid: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cc = url.searchParams.get("cc")?.toUpperCase() || "CN";
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "20"), 50));

  const supabase = createSupabaseServiceClient();

  // Pull recent snapshots so we can compute:
  // - rank delta (vs previous snapshot)
  // - new entry flag
  // - consecutive on-list streak from latest backwards
  const { data: snapshots, error: sErr } = await supabase
    .from("steam_rank_snapshots")
    .select("id,captured_at,list_type,country_code")
    .eq("list_type", "top_sellers")
    .eq("country_code", cc)
    .order("captured_at", { ascending: false })
    .limit(14);

  if (sErr) {
    return Response.json({ error: sErr.message }, { status: 500 });
  }

  const recentSnapshots = (snapshots ?? []) as SnapshotRow[];
  const latestSnapshot = recentSnapshots[0];

  if (!latestSnapshot) {
    // Fallback: live fetch if no snapshot exists yet
    const appIds = await fetchSteamTopSellersAppIds({ cc, count: limit });
    const briefMap = await fetchSteamAppsBrief(appIds, { cc });
    return Response.json({
      ok: true,
      mode: "live",
      countryCode: cc,
      capturedAt: null,
      items: appIds.map((appid, idx) => ({
        rank: idx + 1,
        appid,
        name: briefMap.get(appid)?.name ?? null,
        priceText: briefMap.get(appid)?.priceText ?? null,
        discountPercent: briefMap.get(appid)?.discountPercent ?? null,
        headerImage: briefMap.get(appid)?.headerImage ?? null,
        genres: briefMap.get(appid)?.genres ?? [],
        developers: briefMap.get(appid)?.developers ?? [],
        publishers: briefMap.get(appid)?.publishers ?? [],
        previousRank: null,
        rankDelta: null,
        isNewEntry: null,
        streak: null,
      })),
    });
  }

  const snapshotIds = recentSnapshots.map((s) => s.id);

  const { data: allItems, error: iErr } = await supabase
    .from("steam_rank_snapshot_items")
    .select("snapshot_id,rank,appid")
    .in("snapshot_id", snapshotIds);

  if (iErr) {
    return Response.json({ error: iErr.message }, { status: 500 });
  }

  const rows = (allItems ?? []) as SnapshotItemRow[];
  const bySnapshot = new Map<string, SnapshotItemRow[]>();
  for (const row of rows) {
    const arr = bySnapshot.get(row.snapshot_id) ?? [];
    arr.push(row);
    bySnapshot.set(row.snapshot_id, arr);
  }
  for (const arr of bySnapshot.values()) {
    arr.sort((a, b) => a.rank - b.rank);
  }

  const latestItems = (bySnapshot.get(latestSnapshot.id) ?? []).slice(0, limit);
  const latestAppIds = latestItems.map((it) => it.appid);
  const briefMap = await fetchSteamAppsBrief(latestAppIds, { cc });
  const previousSnapshot = recentSnapshots[1];
  const previousItems = previousSnapshot ? bySnapshot.get(previousSnapshot.id) ?? [] : [];
  const previousRankByAppId = new Map<number, number>();
  for (const row of previousItems) previousRankByAppId.set(row.appid, row.rank);

  // For streak, build appid sets in captured_at desc order.
  const snapshotAppIdSets = recentSnapshots.map((s) => {
    const appIds = new Set((bySnapshot.get(s.id) ?? []).map((it) => it.appid));
    return { snapshotId: s.id, appIds };
  });

  function computeStreak(appid: number) {
    let streak = 0;
    for (const snap of snapshotAppIdSets) {
      if (snap.appIds.has(appid)) streak += 1;
      else break;
    }
    return streak;
  }

  return Response.json({
    ok: true,
    mode: "snapshot",
    countryCode: cc,
    capturedAt: latestSnapshot.captured_at,
    previousCapturedAt: previousSnapshot?.captured_at ?? null,
    items: latestItems.map((it) => {
      const previousRank = previousRankByAppId.get(it.appid) ?? null;
      const rankDelta = previousRank ? previousRank - it.rank : null; // >0 means up
      return {
        rank: it.rank,
        appid: it.appid,
        name: briefMap.get(it.appid)?.name ?? null,
        priceText: briefMap.get(it.appid)?.priceText ?? null,
        discountPercent: briefMap.get(it.appid)?.discountPercent ?? null,
        headerImage: briefMap.get(it.appid)?.headerImage ?? null,
        genres: briefMap.get(it.appid)?.genres ?? [],
        developers: briefMap.get(it.appid)?.developers ?? [],
        publishers: briefMap.get(it.appid)?.publishers ?? [],
        previousRank,
        rankDelta,
        isNewEntry: previousRank == null,
        streak: computeStreak(it.appid),
      };
    }),
  });
}

