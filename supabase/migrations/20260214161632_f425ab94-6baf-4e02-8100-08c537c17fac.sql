
-- ProFit: Independent Artist Revenue Diagnostic Engine

-- Artists cache table
CREATE TABLE public.profit_artists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spotify_artist_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image_url TEXT,
  genres_json JSONB DEFAULT '[]'::jsonb,
  followers_total INTEGER DEFAULT 0,
  popularity INTEGER DEFAULT 0,
  raw_artist_json JSONB,
  signals_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE public.profit_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES public.profit_artists(id) ON DELETE CASCADE,
  blueprint_json JSONB NOT NULL,
  signals_json JSONB,
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  model_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Plan variants (focus plans)
CREATE TABLE public.profit_plan_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.profit_reports(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Chat sessions
CREATE TABLE public.profit_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.profit_reports(id) ON DELETE CASCADE,
  messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: all public read (no user accounts for ProFit)
ALTER TABLE public.profit_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_plan_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_chats ENABLE ROW LEVEL SECURITY;

-- Public read for all tables
CREATE POLICY "Public read profit_artists" ON public.profit_artists FOR SELECT USING (true);
CREATE POLICY "Public read profit_reports" ON public.profit_reports FOR SELECT USING (true);
CREATE POLICY "Public read profit_plan_variants" ON public.profit_plan_variants FOR SELECT USING (true);
CREATE POLICY "Public read profit_chats" ON public.profit_chats FOR SELECT USING (true);

-- Service role insert/update (edge functions use service role)
-- Since these are written by edge functions, we allow anon insert for simplicity
CREATE POLICY "Anon insert profit_artists" ON public.profit_artists FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update profit_artists" ON public.profit_artists FOR UPDATE USING (true);
CREATE POLICY "Anon insert profit_reports" ON public.profit_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert profit_plan_variants" ON public.profit_plan_variants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert profit_chats" ON public.profit_chats FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update profit_chats" ON public.profit_chats FOR UPDATE USING (true);

-- Index for fast lookups
CREATE INDEX idx_profit_artists_spotify_id ON public.profit_artists(spotify_artist_id);
CREATE INDEX idx_profit_reports_artist_id ON public.profit_reports(artist_id);
CREATE INDEX idx_profit_reports_share_token ON public.profit_reports(share_token);
