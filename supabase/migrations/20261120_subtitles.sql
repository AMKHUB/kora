-- Pistes de sous-titres WebVTT synchronisées à la voix et au son (upload .vtt/.srt ou transcription IA)
CREATE TABLE IF NOT EXISTS public.subtitles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title_id bigint REFERENCES public.titles(id) ON DELETE CASCADE,
  episode_id bigint REFERENCES public.episodes(id) ON DELETE CASCADE,
  language_code text NOT NULL DEFAULT 'fr',
  language_label text NOT NULL DEFAULT 'Français',
  vtt_content text NOT NULL,
  offset_ms integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'upload',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (title_id IS NOT NULL OR episode_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_subtitles_title_id ON public.subtitles(title_id);
CREATE INDEX IF NOT EXISTS idx_subtitles_episode_id ON public.subtitles(episode_id);

ALTER TABLE public.subtitles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY subtitles_public_read ON public.subtitles
    FOR SELECT USING (
      (title_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.titles t WHERE t.id = subtitles.title_id AND (t.status = 'published' OR t.creator_id = auth.uid())))
      OR (episode_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.episodes e
        JOIN public.seasons s ON s.id = e.season_id
        JOIN public.titles t ON t.id = s.title_id
        WHERE e.id = subtitles.episode_id AND (t.status = 'published' OR t.creator_id = auth.uid())
      ))
      OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role IN ('admin', 'moderator'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY subtitles_owner_admin_write ON public.subtitles
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role = 'admin')
      OR (title_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.titles t WHERE t.id = subtitles.title_id AND t.creator_id = auth.uid()))
      OR (episode_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.episodes e
        JOIN public.seasons s ON s.id = e.season_id
        JOIN public.titles t ON t.id = s.title_id
        WHERE e.id = subtitles.episode_id AND t.creator_id = auth.uid()
      ))
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role = 'admin')
      OR (title_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.titles t WHERE t.id = subtitles.title_id AND t.creator_id = auth.uid()))
      OR (episode_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.episodes e
        JOIN public.seasons s ON s.id = e.season_id
        JOIN public.titles t ON t.id = s.title_id
        WHERE e.id = subtitles.episode_id AND t.creator_id = auth.uid()
      ))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
