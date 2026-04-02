import { tryCreateSupabaseServiceClient } from "@/lib/supabase/server";

export type PcOwnershipYearlyRow = {
  year: number;
  value: number;
  unit: string;
  source: string | null;
  note: string | null;
};

export type BrowserShareMonthlyRow = {
  month: string; // YYYY-MM-01
  shares: Record<string, number>;
  source: string | null;
  note: string | null;
};

export type PcShipmentsQuarterlyRow = {
  quarter: string; // YYYY-MM-01 (quarter start)
  total_million_units: number;
  shares: Record<string, number>;
  source: string | null;
  note: string | null;
};

export type SearchEngineShareMonthlyRow = {
  month: string; // YYYY-MM-01
  shares: Record<string, number>;
  source: string | null;
  note: string | null;
};

/** JSONB 偶发为字符串或异常结构时，避免下游 Object.entries 抛错 */
function coerceSharesRecord(raw: unknown): Record<string, number> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return coerceSharesRecord(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function getLatestPcOwnership(): Promise<PcOwnershipYearlyRow | null> {
  try {
    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("pc_ownership_yearly")
      .select("year,value,unit,source,note")
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data ?? null) as PcOwnershipYearlyRow | null;
  } catch {
    return null;
  }
}

export async function getLatestBrowserShare(): Promise<BrowserShareMonthlyRow | null> {
  try {
    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("pc_browser_share_monthly")
      .select("month,shares,source,note")
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      shares: coerceSharesRecord(data.shares),
    } as BrowserShareMonthlyRow;
  } catch {
    return null;
  }
}

export async function getLatestPcShipmentsQuarterly(): Promise<PcShipmentsQuarterlyRow | null> {
  try {
    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("pc_shipments_quarterly")
      .select("quarter,total_million_units,shares,source,note")
      .order("quarter", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const tu = Number(data.total_million_units);
    return {
      ...data,
      total_million_units: Number.isFinite(tu) ? tu : 0,
      shares: coerceSharesRecord(data.shares),
    } as PcShipmentsQuarterlyRow;
  } catch {
    return null;
  }
}

export async function getLatestSearchEngineShare(): Promise<SearchEngineShareMonthlyRow | null> {
  try {
    const supabase = tryCreateSupabaseServiceClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("pc_search_engine_share_monthly")
      .select("month,shares,source,note")
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      shares: coerceSharesRecord(data.shares),
    } as SearchEngineShareMonthlyRow;
  } catch {
    return null;
  }
}
