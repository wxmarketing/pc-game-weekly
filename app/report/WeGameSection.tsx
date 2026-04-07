"use client";

import { useMemo, useState } from "react";

type WgGame = {
  rank: number;
  title: string;
  cover_image: string | null;
  tags: string[];
  price: string | null;
  store_url: string | null;
  weekly_follows: number | null;
};

type Pack = { games: WgGame[]; generatedAt: string | null } | null;

function dateOnlyLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  return s;
}

function normalizeCoverUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
  return raw;
}

function Row({
  g,
}: {
  g: WgGame;
}) {
  const cover = normalizeCoverUrl(g.cover_image);
  const subtitle = g.tags.length ? g.tags.slice(0, 3).join(" · ") : "标签未知";
  const rightTop = g.price ?? "—";
  const rightBottom =
    typeof g.weekly_follows === "number" ? `本周预约 ${g.weekly_follows.toLocaleString()}` : null;

  return (
    <div className="hover:bg-zinc-50/60">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="tabular-nums">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-xs font-semibold text-zinc-700">
            #{g.rank}
          </span>
        </div>
        {cover ? (
          <img
            src={cover}
            alt={g.title}
            className="h-14 w-[108px] rounded-md border border-zinc-200 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-14 w-[108px] rounded-md border border-zinc-200 bg-zinc-100" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {g.store_url ? (
            <a
              className="truncate text-[15px] font-semibold text-zinc-900 hover:underline"
              href={g.store_url}
              target="_blank"
              rel="noreferrer"
              title={g.title}
            >
              {g.title}
            </a>
          ) : (
            <div className="truncate text-[15px] font-semibold text-zinc-900" title={g.title}>
              {g.title}
            </div>
          )}
          <div className="mt-0.5 truncate text-[12px] text-zinc-500">{subtitle}</div>
        </div>

        <div className="w-20 shrink-0 tabular-nums text-zinc-700 flex flex-col items-center">
          <div className="text-sm font-semibold text-zinc-900 text-center">{rightTop}</div>
          {rightBottom ? (
            <div className="mt-1 w-full flex justify-center">
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {rightBottom}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  pack,
}: {
  title: string;
  pack: Pack;
}) {
  const [expanded, setExpanded] = useState(false);
  const games = pack?.games ?? [];
  const shown = expanded ? games : games.slice(0, 5);
  const canToggle = games.length > 5;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <span className="text-xs text-zinc-500">{dateOnlyLabel(pack?.generatedAt)}</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="divide-y divide-zinc-100">
          {shown.length ? (
            shown.map((g) => <Row key={g.rank} g={g} />)
          ) : (
            <div className="p-6 text-sm text-zinc-500">暂无数据。</div>
          )}
        </div>
      </div>

      {!expanded && canToggle ? (
        <div className="pointer-events-none relative -mt-10">
          <div className="h-10 bg-gradient-to-t from-white via-white/90 to-transparent" />
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="group inline-flex items-center rounded-full border border-zinc-200 bg-white/90 px-4 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="transition group-hover:text-zinc-900">点击展开</span>
            </button>
          </div>
        </div>
      ) : null}

      {expanded && canToggle ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="group inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="transition group-hover:text-zinc-900">点击收起</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function WeGameSection({
  bestseller,
  purchase,
  follow,
}: {
  bestseller: Pack;
  purchase: Pack;
  follow: Pack;
}) {
  const cards = useMemo(
    () => [
      { title: "火爆新品", pack: bestseller },
      { title: "本周热销", pack: purchase },
      { title: "新游预约", pack: follow },
    ],
    [bestseller, purchase, follow],
  );

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">WeGame</h2>
        <span className="text-xs text-zinc-500">
          数据来自 Supabase：<code className="rounded bg-zinc-100 px-1">wegame_bestseller</code> /{" "}
          <code className="rounded bg-zinc-100 px-1">wegame_purchase</code> /{" "}
          <code className="rounded bg-zinc-100 px-1">wegame_follow</code>
        </span>
      </div>

      <div className="grid gap-6">
        {cards.map((c) => (
          <SectionCard key={c.title} title={c.title} pack={c.pack} />
        ))}
      </div>
    </section>
  );
}

