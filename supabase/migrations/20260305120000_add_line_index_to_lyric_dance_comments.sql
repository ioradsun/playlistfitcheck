alter table lyric_dance_comments
add column if not exists line_index integer null;

comment on column lyric_dance_comments.line_index is
  'Zero-based index into the song allLines array. Null = song-level comment.';
