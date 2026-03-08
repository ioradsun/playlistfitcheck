create table if not exists public.battle_comments (
  id uuid default gen_random_uuid() primary key,
  battle_id text not null,
  user_id uuid references auth.users(id),
  session_id text,
  voted_side text check (voted_side in ('a', 'b')),
  text text not null,
  created_at timestamptz default now()
);

alter table public.battle_comments enable row level security;

create policy "Anyone can read battle comments"
  on public.battle_comments for select using (true);

create policy "Anyone can insert battle comments"
  on public.battle_comments for insert with check (true);

create index idx_battle_comments_battle on public.battle_comments (battle_id, created_at desc);
