function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[™®©]/g, "")
    .trim();
}

type SearchResp = {
  results_html?: string;
};

function extractFirstAppIdFromResultsHtml(html: string): number | null {
  // Prefer data-ds-appid
  const m = html.match(/data-ds-appid="([^"]+)"/);
  if (m?.[1]) {
    const first = m[1].split(",")[0]?.trim();
    const n = Number(first);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Fallback: /app/12345
  const m2 = html.match(/\/app\/(\d+)\//);
  if (m2?.[1]) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export async function resolveSteamAppIdByName(
  name: string,
  options: { cc?: string; l?: string } = {},
): Promise<number | null> {
  const q = name.trim();
  if (!q) return null;

  const l = options.l || "schinese";
  const cc = options.cc ? options.cc.toUpperCase() : undefined;

  async function tryOnce(params: { cc?: string }) {
    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("term", q);
    url.searchParams.set("start", "0");
    url.searchParams.set("count", "10");
    url.searchParams.set("infinite", "1");
    url.searchParams.set("l", l);
    if (params.cc) url.searchParams.set("cc", params.cc);

    const resp = await fetch(url.toString(), {
      headers: { "user-agent": "pc-game-weekly-bot/1.0", accept: "application/json,text/plain,*/*" },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as SearchResp;
    const html = data.results_html || "";
    if (!html) return null;

    const appid = extractFirstAppIdFromResultsHtml(html);
    return appid;
  }

  // Try country-scoped first; some names differ, but cc=CN may hide apps.
  const a = cc ? await tryOnce({ cc }) : null;
  if (a) return a;
  const b = await tryOnce({});
  return b;
}

export function isProbablySameTitle(a: string, b: string) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

