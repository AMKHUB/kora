-- Kora : suppression des séries d'exemple + support complet Kora Studio (Créateurs).

-- 1. Supprimer les 4 séries fictives d'exemple (Nuits de Bamako, Dakar Mixtape, Accra Rooftop, Kalan)
DELETE FROM public.titles WHERE id IN (2, 7, 10, 21) AND type = 'series';

-- 2. Ajouter la colonne creator_id sur titles pour lier chaque œuvre à son créateur
ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_titles_creator_id ON public.titles (creator_id);

-- 3. Table des chaînes créateurs (Kora Studio)
CREATE TABLE IF NOT EXISTS public.creator_channels (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  channel_name text NOT NULL,
  bio text DEFAULT '',
  country text NOT NULL DEFAULT 'Mali',
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_channels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY "chaines createurs publiques" ON public.creator_channels FOR SELECT TO anon, authenticated USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "creer sa chaine createur" ON public.creator_channels FOR INSERT TO authenticated WITH CHECK (account_id = (SELECT auth.uid()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "modifier sa chaine createur" ON public.creator_channels FOR UPDATE TO authenticated USING (account_id = (SELECT auth.uid()) OR (SELECT private.is_admin())) WITH CHECK (account_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 4. Politiques RLS Créateurs sur titles, seasons, episodes, video_assets, title_genres, title_languages, title_people, people, rights
DO $$
BEGIN
  -- titles : un créateur gère ses propres œuvres (creator_id = auth.uid())
  BEGIN
    CREATE POLICY "createur lit ses titres" ON public.titles FOR SELECT TO authenticated USING (creator_id = (SELECT auth.uid()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "createur cree ses titres" ON public.titles FOR INSERT TO authenticated WITH CHECK (creator_id = (SELECT auth.uid()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "createur modifie ses titres" ON public.titles FOR UPDATE TO authenticated USING (creator_id = (SELECT auth.uid())) WITH CHECK (creator_id = (SELECT auth.uid()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "createur supprime ses titres" ON public.titles FOR DELETE TO authenticated USING (creator_id = (SELECT auth.uid()));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- seasons
  BEGIN
    CREATE POLICY "createur gere ses saisons" ON public.seasons FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = seasons.title_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = seasons.title_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- episodes
  BEGIN
    CREATE POLICY "createur gere ses episodes" ON public.episodes FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.seasons s JOIN public.titles t ON t.id = s.title_id WHERE s.id = episodes.season_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.seasons s JOIN public.titles t ON t.id = s.title_id WHERE s.id = episodes.season_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- title_genres
  BEGIN
    CREATE POLICY "createur gere genres titres" ON public.title_genres FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_genres.title_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_genres.title_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- title_languages
  BEGIN
    CREATE POLICY "createur gere langues titres" ON public.title_languages FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_languages.title_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_languages.title_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- people (ajout autorisé pour les créateurs authentifiés)
  BEGIN
    CREATE POLICY "createur ajoute personnes" ON public.people FOR INSERT TO authenticated WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- title_people
  BEGIN
    CREATE POLICY "createur gere personnes titres" ON public.title_people FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_people.title_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = title_people.title_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- video_assets
  BEGIN
    CREATE POLICY "createur gere ses videos" ON public.video_assets FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.titles t WHERE t.id = video_assets.title_id AND t.creator_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.episodes e JOIN public.seasons s ON s.id = e.season_id JOIN public.titles t ON t.id = s.title_id WHERE e.id = video_assets.episode_id AND t.creator_id = (SELECT auth.uid()))
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.titles t WHERE t.id = video_assets.title_id AND t.creator_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.episodes e JOIN public.seasons s ON s.id = e.season_id JOIN public.titles t ON t.id = s.title_id WHERE e.id = video_assets.episode_id AND t.creator_id = (SELECT auth.uid()))
      );
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- rights
  BEGIN
    CREATE POLICY "createur gere droits ses titres" ON public.rights FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = rights.title_id AND t.creator_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.titles t WHERE t.id = rights.title_id AND t.creator_id = (SELECT auth.uid())));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 5. Politiques Supabase Storage pour les créateurs (dossier isolé creator/<user_id>/...)
DO $$
BEGIN
  BEGIN
    CREATE POLICY "posters createur insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'posters' AND (storage.foldername(name))[1] = 'creator' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "posters createur update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'posters' AND (storage.foldername(name))[1] = 'creator' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "videos createur insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = 'creator' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    CREATE POLICY "videos createur update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = 'creator' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
