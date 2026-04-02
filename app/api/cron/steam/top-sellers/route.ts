import { assertCronAuthorized } from "@/lib/cron/auth";
import { fetchSteamTopSellersAppIds } from "@/lib/steam/topSellers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SnapshotInsert = {
  list_type: string;
  country_code: string;
  source_url: string;
  meta: Record<string, unknown>;
};

export async function GET(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const cc = new URL(request.url).searchParams.get("cc")?.toUpperCase() || "CN";

  const appIds = await fetchSteamTopSellersAppIds({ cc, count: 50 });
  const sourceUrl = `https://store.steampowered.com/search/?filter=topsellers&os=win&cc=${cc}`;

  const supabase = createSupabaseServiceClient();

  const snapshot: SnapshotInsert = {
    list_type: "top_sellers",
    country_code: cc,
    source_url: sourceUrl,
    meta: { count: appIds.length },
  };

  const { data: snapshotRow, error: snapshotErr } = await supabase
    .from("steam_rank_snapshots")
    .insert(snapshot)
    .select("id,captured_at")
    .single();

  if (snapshotErr || !snapshotRow) {
    return Response.json(
      { error: "snapshot_insert_failed", detail: snapshotErr?.message },
      { status: 500 },
    );
  }

  const items = appIds.map((appid, idx) => ({
    snapshot_id: snapshotRow.id,
    rank: idx + 1,
    appid,
  }));

  const { error: itemsErr } = await supabase
    .from("steam_rank_snapshot_items")
    .insert(items);

  if (itemsErr) {
    return Response.json(
      { error: "items_insert_failed", detail: itemsErr.message },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    snapshotId: snapshotRow.id,
    capturedAt: snapshotRow.captured_at,
    count: items.length,
    elapsedMs: Date.now() - startedAt,
  });
}

