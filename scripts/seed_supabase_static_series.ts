import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const url = mustGetEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const shipments = {
    quarter: "2025-07-01", // 2025Q3
    total_million_units: 11.3,
    shares: {
      Lenovo: 0.39,
      Huawei: 0.09,
      HP: 0.09,
      iSoftStone: 0.08,
      Asus: 0.08,
      Others: 0.26,
    },
    source:
      "https://omdia.tech.informa.com/pr/2025/dec/chinas-pc-market-growth-softened-in-q3-2025-as-consumer-subsidy-effects-diminished",
    note: "Omdia PC Market Pulse（Q3 2025）",
    updated_at: new Date().toISOString(),
  };

  const searchShare = {
    month: "2026-03-01",
    shares: {
      bing: 0.3502,
      Baidu: 0.3486,
      Haosou: 0.2048,
      YANDEX: 0.0534,
      Google: 0.0271,
      Sogou: 0.0156,
    },
    source: "https://gs.statcounter.com/search-engine-market-share/desktop/china",
    note: "StatCounter（Desktop · China · Search Engine Market Share · March 2026）",
    updated_at: new Date().toISOString(),
  };

  const a = await supabase.from("pc_shipments_quarterly").upsert(shipments, { onConflict: "quarter" });
  if (a.error) throw new Error(`pc_shipments_quarterly upsert failed: ${JSON.stringify(a.error)}`);

  const b = await supabase
    .from("pc_search_engine_share_monthly")
    .upsert(searchShare, { onConflict: "month" });
  if (b.error) throw new Error(`pc_search_engine_share_monthly upsert failed: ${JSON.stringify(b.error)}`);

  // eslint-disable-next-line no-console
  console.log("OK: seeded pc_shipments_quarterly and pc_search_engine_share_monthly");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

