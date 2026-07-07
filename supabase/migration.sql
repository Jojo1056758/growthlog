-- GrowthLog – Migration V1
-- In Supabase: SQL Editor → New query → einfügen → Run

-- Tagebucheinträge (alle Antworten flexibel in JSONB, dadurch später erweiterbar ohne Migration)
create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  answers jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index if not exists idx_entries_user_date
  on public.daily_entries (user_id, entry_date desc);

-- Eigene Vokabeln des Nutzers
create table if not exists public.user_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null refences auth.users(id) on delete cascade,
  word text not null,
  definition text not null default '',
  example text,
  notes text,
  review_count int not null default 0,
  correct_count int not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_words_user on public.user_words (user_id, created_at desc);

-- updated_at automatisch pflegen
create or export function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_entries_updated on public.daily_entries;
create trigger trg_entries_updated
  before update on public.daily_entries
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.daily_entries enable row level security;
alter table public.user_words enable row level security;

drop policy if exists "entries_select_own" on public.daily_entries;
drop policy if exists "entries_insert_own" on public.daily_entries;
drop policy if exists "entries_update_own" on public.daily_entries;
drop policy if exists "entries_delete_own" on public.daily_entries;

create policy "entries_select_own" on public.daily_entries
  for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.daily_entries
  for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.daily_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entries_delete_own" on public.daily_entries
  for delete using (auth.uid() = user_id);

drop policy if exists "words_select_own" on public.user_words;
drop policy if exists "words_insert_own" on public.user_words;
drop policy if exists "words_update_own" on public.user_words;
drop policy if exists "words_delete_own" on public.user_words;

create policy "words_select_own" on public.user_words
  for select using (auth.uid() = user_id);
create policy "words_insert_own" on public.user_words
  for insert with check (auth.uid() = user_id);
create policy "words_update_own" on public.user_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "words_delete_own" on public.user_words
  for delete using (auth.uid() = user_id);
