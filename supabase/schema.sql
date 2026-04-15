-- PC Game Weekly - Supabase schema
-- Focus: Steam 榜单快照（最小存储）+ 情报候选池（审核流）+ 周报发布

create extension if not exists pgcrypto;

-- ===== Steam ranking snapshots =====
create table if not exists public.steam_rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  list_type text not null, -- e.g. 'top_sellers'
  country_code text not null default 'CN',
  source_url text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists steam_rank_snapshots_list_time_idx
  on public.steam_rank_snapshots (list_type, captured_at desc);

create table if not exists public.steam_rank_snapshot_items (
  snapshot_id uuid not null references public.steam_rank_snapshots(id) on delete cascade,
  rank int not null check (rank > 0),
  appid bigint not null check (appid > 0),
  primary key (snapshot_id, rank)
);

create index if not exists steam_rank_snapshot_items_appid_idx
  on public.steam_rank_snapshot_items (appid);

-- ===== Weekly reports (published payload) =====
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start, week_end)
);

create index if not exists weekly_reports_status_time_idx
  on public.weekly_reports (status, week_start desc);

-- ===== Event candidates (review: approve/reject) =====
create table if not exists public.event_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null, -- e.g. 'steam_blog', 'wegame_news'
  url text,
  title text not null,
  summary text,
  category text not null, -- e.g. 'pc_game/indie', 'platform/steam'
  tags text[] not null default '{}',
  impact text not null default 'medium' check (impact in ('low', 'medium', 'high')),
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  occurred_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_candidates_status_time_idx
  on public.event_candidates (status, created_at desc);

-- ===== Static / manual series =====
-- 1) 国内 PC 电脑保有量（年）: 固定信息，偶尔更新
create table if not exists public.pc_ownership_yearly (
  year int primary key check (year >= 1980),
  value numeric not null check (value >= 0),
  unit text not null default '台',
  source text,
  note text,
  updated_at timestamptz not null default now()
);

-- 2) 国内 PC 浏览器份额（月）: 每月手动更新（可录多品牌）
create table if not exists public.pc_browser_share_monthly (
  month date primary key, -- use first day of month
  shares jsonb not null default '{}'::jsonb, -- { "Chrome": 0.62, "Edge": 0.18, ... } (0-1)
  source text,
  note text,
  updated_at timestamptz not null default now()
);

-- 3) 国内 PC 出货量（季度）
create table if not exists public.pc_shipments_quarterly (
  quarter date primary key, -- use first day of quarter, e.g. 2025-07-01 for 2025Q3
  total_million_units numeric not null check (total_million_units >= 0),
  shares jsonb not null default '{}'::jsonb, -- { "Lenovo": 0.39, ... } (0-1)
  source text,
  note text,
  updated_at timestamptz not null default now()
);

-- 4) PC 搜索引擎份额（月）
create table if not exists public.pc_search_engine_share_monthly (
  month date primary key, -- use first day of month
  shares jsonb not null default '{}'::jsonb, -- { "bing": 0.35, "Baidu": 0.34, ... } (0-1)
  source text,
  note text,
  updated_at timestamptz not null default now()
);

-- 5) Bangumi 缓存（entity_name -> 封面、商店链接、标签）
create table if not exists public.bangumi_cache (
  entity_name text primary key, -- 实体名（游戏名），作为主键
  bangumi_id int, -- Bangumi subject id，可能为 null（找不到匹配）
  cover_url text, -- 封面图 URL
  store_url text, -- 首选商店链接
  store_type text, -- 商店类型 (steam/epic/official/bgm 等)
  name_cn text, -- Bangumi 上的中文名
  name text, -- Bangumi 上的原名
  tags text[], -- 游戏类型标签（从 Bangumi 获取的热门标签）
  platform text, -- 平台信息
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bangumi_cache_bangumi_id_idx
  on public.bangumi_cache (bangumi_id);

-- ===== RLS =====
alter table public.steam_rank_snapshots enable row level security;
alter table public.steam_rank_snapshot_items enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.event_candidates enable row level security;
alter table public.pc_ownership_yearly enable row level security;
alter table public.pc_browser_share_monthly enable row level security;
alter table public.pc_shipments_quarterly enable row level security;
alter table public.pc_search_engine_share_monthly enable row level security;
alter table public.bangumi_cache enable row level security;

-- Public read (site is public). Writes are done by server using service role (bypasses RLS).
drop policy if exists "steam_rank_snapshots_read" on public.steam_rank_snapshots;
create policy "steam_rank_snapshots_read"
  on public.steam_rank_snapshots
  for select
  using (true);

drop policy if exists "steam_rank_snapshot_items_read" on public.steam_rank_snapshot_items;
create policy "steam_rank_snapshot_items_read"
  on public.steam_rank_snapshot_items
  for select
  using (true);

drop policy if exists "weekly_reports_read" on public.weekly_reports;
create policy "weekly_reports_read"
  on public.weekly_reports
  for select
  using (status = 'published');

-- Event candidates should be readable only to authenticated users (for review UI).
drop policy if exists "event_candidates_read_authed" on public.event_candidates;
create policy "event_candidates_read_authed"
  on public.event_candidates
  for select
  to authenticated
  using (true);

-- Allow authenticated reviewers to update status (approve/reject) in UI.
drop policy if exists "event_candidates_update_authed" on public.event_candidates;
create policy "event_candidates_update_authed"
  on public.event_candidates
  for update
  to authenticated
  using (true)
  with check (true);

-- Public read for static/manual series (report page is public)
drop policy if exists "pc_ownership_yearly_read" on public.pc_ownership_yearly;
create policy "pc_ownership_yearly_read"
  on public.pc_ownership_yearly
  for select
  using (true);

drop policy if exists "pc_browser_share_monthly_read" on public.pc_browser_share_monthly;
create policy "pc_browser_share_monthly_read"
  on public.pc_browser_share_monthly
  for select
  using (true);

drop policy if exists "pc_shipments_quarterly_read" on public.pc_shipments_quarterly;
create policy "pc_shipments_quarterly_read"
  on public.pc_shipments_quarterly
  for select
  using (true);

drop policy if exists "pc_search_engine_share_monthly_read" on public.pc_search_engine_share_monthly;
create policy "pc_search_engine_share_monthly_read"
  on public.pc_search_engine_share_monthly
  for select
  using (true);

-- Allow authenticated users to upsert static/manual series via admin UI (future)
drop policy if exists "pc_ownership_yearly_upsert_authed" on public.pc_ownership_yearly;
create policy "pc_ownership_yearly_upsert_authed"
  on public.pc_ownership_yearly
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "pc_browser_share_monthly_upsert_authed" on public.pc_browser_share_monthly;
create policy "pc_browser_share_monthly_upsert_authed"
  on public.pc_browser_share_monthly
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "pc_shipments_quarterly_upsert_authed" on public.pc_shipments_quarterly;
create policy "pc_shipments_quarterly_upsert_authed"
  on public.pc_shipments_quarterly
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "pc_search_engine_share_monthly_upsert_authed" on public.pc_search_engine_share_monthly;
create policy "pc_search_engine_share_monthly_upsert_authed"
  on public.pc_search_engine_share_monthly
  for all
  to authenticated
  using (true)
  with check (true);

-- Bangumi cache: public read, service role write
drop policy if exists "bangumi_cache_read" on public.bangumi_cache;
create policy "bangumi_cache_read"
  on public.bangumi_cache
  for select
  using (true);

drop policy if exists "bangumi_cache_insert_service" on public.bangumi_cache;
create policy "bangumi_cache_insert_service"
  on public.bangumi_cache
  for insert
  to service_role
  with check (true);

drop policy if exists "bangumi_cache_update_service" on public.bangumi_cache;
create policy "bangumi_cache_update_service"
  on public.bangumi_cache
  for update
  to service_role
  using (true)
  with check (true);

