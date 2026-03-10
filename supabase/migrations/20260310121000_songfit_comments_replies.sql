alter table public.songfit_comments
  add column if not exists parent_comment_id uuid
    references public.songfit_comments(id) on delete cascade;

create index if not exists songfit_comments_parent_idx
  on public.songfit_comments (parent_comment_id);
