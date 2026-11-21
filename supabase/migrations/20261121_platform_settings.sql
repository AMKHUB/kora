-- Paramètres globaux de la plateforme Kora (pilotables en 1 clic depuis l'Espace Administrateur)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  billing_simulation boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'Nous effectuons une mise à jour pour améliorer votre expérience cinéma sur Kora. Le service sera de retour très bientôt.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, billing_simulation, maintenance_mode)
VALUES (1, true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY platform_settings_public_read ON public.platform_settings
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY platform_settings_admin_write ON public.platform_settings
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = auth.uid() AND a.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
