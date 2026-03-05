
create table if not exists public.lyric_dance_reactions (
  id          uuid default gen_random_uuid() primary key,
  dance_id    uuid not null references public.shareable_lyric_dances(id) on delete cascade,
  line_index  integer null,
  section_index integer null,
  emoji       text not null,
  session_id  text null,
  created_at  timestamptz default now()
);

create index if not exists lyric_dance_reactions_dance_id_idx
  on public.lyric_dance_reactions(dance_id);

create index if not exists lyric_dance_reactions_dance_line_idx
  on public.lyric_dance_reactions(dance_id, line_index);

alter table public.lyric_dance_reactions enable row level security;

create policy "anyone can insert reactions"
  on public.lyric_dance_reactions for insert with check (true);

create policy "anyone can read reactions"
  on public.lyric_dance_reactions for select using (true);
