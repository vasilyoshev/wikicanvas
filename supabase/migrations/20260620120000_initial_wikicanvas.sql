-- supabase/migrations/20260620120000_initial_wikicanvas.sql
-- WikiCanvas v1 initial schema: session / node / edge.
-- LWW clock = session.updated_at; deleted_at = soft-delete tombstone (propagates under LWW).
-- node/edge carry NO user_id (spec §6 / V3): RLS scopes them via the parent session.

create extension if not exists pgcrypto;

-- Keeps session.updated_at current on any direct UPDATE. (The app also bumps it explicitly
-- on node/edge mutations via the local repo so the LWW clock advances even on inserts elsewhere.)
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- session ---------------------------------------------------------------------
create table if not exists public.session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null default '',
  viewport_x real not null default 0,
  viewport_y real not null default 0,
  viewport_zoom real not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

-- indexes on session ----------------------------------------------------------
create index if not exists idx_session_user_id on public.session (user_id);

-- updated_at trigger on session ----------------------------------------------
drop trigger if exists set_session_updated_at on public.session;
create trigger set_session_updated_at
before update on public.session
for each row execute function public.set_current_timestamp_updated_at();

-- RLS: session ----------------------------------------------------------------
alter table public.session enable row level security;

-- session: owner-only (auth.uid() = user_id)
drop policy if exists "session_all_own" on public.session;
create policy "session_all_own" on public.session
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Helper: checks that a session_id belongs to the calling user.
-- Used by node and edge RLS so those tables carry no user_id of their own.
-- The subquery `session_id in (select id from public.session where user_id = auth.uid())`
-- is the canonical V3 scoping predicate (spec §6).
create or replace function public.owns_session(session_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select session_id in (select id from public.session where user_id = auth.uid())
$$;

-- node ------------------------------------------------------------------------
create table if not exists public.node (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session (id) on delete cascade,
  article_title text not null,
  lang text not null,
  x real not null default 0,
  y real not null default 0,
  width real not null default 380,
  height real not null default 520,
  parent_node_id uuid references public.node (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

-- indexes on node -------------------------------------------------------------
create index if not exists idx_node_session_id on public.node (session_id);

-- RLS: node -------------------------------------------------------------------
alter table public.node enable row level security;

-- node: scoped via the parent session (V3: no direct ownership column)
drop policy if exists "node_all_own" on public.node;
create policy "node_all_own" on public.node
  for all to authenticated
  using (public.owns_session(session_id))
  with check (public.owns_session(session_id));

-- edge ------------------------------------------------------------------------
create table if not exists public.edge (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session (id) on delete cascade,
  source_node_id uuid not null references public.node (id) on delete cascade,
  target_node_id uuid not null references public.node (id) on delete cascade,
  clicked_link_text text,
  created_at timestamptz not null default timezone('utc', now())
);

-- indexes on edge -------------------------------------------------------------
create index if not exists idx_edge_session_id on public.edge (session_id);

-- RLS: edge -------------------------------------------------------------------
alter table public.edge enable row level security;

-- edge: scoped via the parent session (V3: no direct ownership column)
drop policy if exists "edge_all_own" on public.edge;
create policy "edge_all_own" on public.edge
  for all to authenticated
  using (public.owns_session(session_id))
  with check (public.owns_session(session_id));
