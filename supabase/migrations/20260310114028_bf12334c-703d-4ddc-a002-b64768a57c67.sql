alter table public.shareable_lyric_dances
  add column if not exists post_id uuid
    references public.songfit_posts(id) on delete set null;

create index if not exists shareable_lyric_dances_post_id_idx
  on public.shareable_lyric_dances (post_id);