create table public.songfit_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.songfit_comments(id) on delete cascade,
  emoji text not null,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.songfit_comment_reactions (comment_id, emoji);

alter table public.songfit_comment_reactions enable row level security;

create policy "Anyone can insert comment reactions"
  on public.songfit_comment_reactions for insert
  with check (true);

create policy "Anyone can read comment reactions"
  on public.songfit_comment_reactions for select
  using (true);
