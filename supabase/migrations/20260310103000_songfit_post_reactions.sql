create table public.songfit_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.songfit_posts(id) on delete cascade,
  emoji text not null,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.songfit_post_reactions (post_id, emoji);

alter table public.songfit_post_reactions enable row level security;

create policy "Anyone can insert reactions"
  on public.songfit_post_reactions for insert
  with check (true);

create policy "Anyone can read reactions"
  on public.songfit_post_reactions for select
  using (true);
