import { fetchSteamAppsBrief } from "@/lib/steam/appDetails";
import { fetchSteamMostPlayed } from "@/lib/steam/mostPlayedApi";

export type SteamMostPlayedItem = {
  appid: number;
  rank: number;
  name: string | null;
  headerImage: string | null;
  genres: string[];
  concurrentInGame: number | null;
  peakInGame: number | null;
};

export type SteamMostPlayedReport = {
  countryCode: string;
  generatedAt: string;
  top: SteamMostPlayedItem[];
};

export async function buildSteamMostPlayedReport(options: {
  cc?: string;
  limit?: number;
}): Promise<SteamMostPlayedReport | null> {
  const cc = (options.cc || "CN").toUpperCase();
  const limit = Math.max(5, Math.min(options.limit ?? 10, 50));
  if (!process.env.STEAM_WEB_API_KEY) return null;

  const mostPlayed = await fetchSteamMostPlayed({ countryCode: cc, count: limit });
  const appIds = mostPlayed.rows.map((r) => r.appid);
  const brief = await fetchSteamAppsBrief(appIds, { cc });

  const top: SteamMostPlayedItem[] = mostPlayed.rows.map((r) => {
    const b = brief.get(r.appid);
    return {
      appid: r.appid,
      rank: r.rank,
      name: b?.name ?? null,
      headerImage: b?.headerImage ?? null,
      genres: b?.genres ?? [],
      concurrentInGame: r.concurrentInGame,
      peakInGame: r.peakInGame,
    };
  });

  return {
    countryCode: cc,
    generatedAt: new Date().toISOString(),
    top,
  };
}

