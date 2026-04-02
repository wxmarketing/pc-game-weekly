import dotenv from "dotenv";
import { createSupabaseServiceClient } from "../lib/supabase/server";

dotenv.config({ path: ".env.local" });

type StatcounterRow = {
  month: string; // YYYY-MM-01
  sharesPercent: Record<string, number>;
  sourceUrl: string;
  note?: string;
};

function percentToShare(x: number) {
  return Math.round((x / 100) * 1_000_000) / 1_000_000;
}

async function upsertBrowserShare(row: StatcounterRow) {
  const supabase = createSupabaseServiceClient();
  const shares: Record<string, number> = {};
  for (const [k, v] of Object.entries(row.sharesPercent)) {
    shares[k] = percentToShare(v);
  }

  const { error } = await supabase.from("pc_browser_share_monthly").upsert({
    month: row.month,
    shares,
    source: row.sourceUrl,
    note: row.note ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Supabase error:", error);
    const detail = (error?.message || (error as { details?: string }).details || (error as { hint?: string }).hint || "").toString();
    const code = (error as any)?.code as string | undefined;
    if (code === "42P01") {
      throw new Error(
        "表 pc_browser_share_monthly 不存在：请先在 Supabase SQL Editor 执行更新后的 supabase/schema.sql（新增 pc_browser_share_monthly）。",
      );
    }
    throw new Error(detail || "Supabase upsert failed (no details)");
  }
}

async function main() {
  const sourceUrl = "https://gs.statcounter.com/browser-market-share/desktop/china";

  // From Statcounter "Desktop Browser Market Share in China - February 2026"
  // Source page: https://gs.statcounter.com/browser-market-share/desktop/china
  const feb2026: StatcounterRow = {
    month: "2026-02-01",
    sharesPercent: {
      Chrome: 58.88,
      Edge: 22.92,
      "360 Safe": 7.97,
      Safari: 4.03,
      "QQ Browser": 3.11,
      Firefox: 1.61,
    },
    sourceUrl,
    note: "Statcounter Global Stats (Desktop, China), Feb 2026. Percentages stored as 0-1 shares.",
  };

  await upsertBrowserShare(feb2026);
  // eslint-disable-next-line no-console
  console.log("OK upserted pc_browser_share_monthly:", feb2026.month);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("FAILED:", err?.message || err);
  process.exit(1);
});

