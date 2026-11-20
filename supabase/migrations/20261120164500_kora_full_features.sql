-- Kora : enrichissement des offres, sécurité RLS renforcée, appareils, notifications et gestion admin/modérateur.

-- 1. Offre Famille & Cinéma (4K, 4 écrans, 6 profils)
INSERT INTO public.plans (id, name, price_xof, billing_interval, max_screens, max_profiles, max_quality, has_ads, allow_downloads)
VALUES ('family', 'Famille & Cinéma', 4500, 'month', 4, 6, '4K', false, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Helper modérateur ou administrateur (dans le schéma private)
CREATE OR REPLACE FUNCTION private.is_moderator_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'moderator')
  );
$$;

-- 3. Protection anti-élévation de privilèges sur accounts.role
CREATE OR REPLACE FUNCTION private.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
      RAISE EXCEPTION 'Modification du rôle non autorisée';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.accounts;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_role_escalation();

-- 4. Politiques RLS pour devices (enregistrement et révocation de ses propres appareils)
DROP POLICY IF EXISTS "ajouter son appareil" ON public.devices;
CREATE POLICY "ajouter son appareil"
  ON public.devices FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "modifier son appareil" ON public.devices;
CREATE POLICY "modifier son appareil"
  ON public.devices FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "supprimer son appareil" ON public.devices;
CREATE POLICY "supprimer son appareil"
  ON public.devices FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));

-- 5. Politiques RLS pour reports (autoriser aussi les modérateurs à lire et traiter les signalements)
DROP POLICY IF EXISTS "signalements lisibles" ON public.reports;
CREATE POLICY "signalements lisibles"
  ON public.reports FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()) OR (SELECT private.is_moderator_or_admin()));

DROP POLICY IF EXISTS "admin traite les signalements" ON public.reports;
CREATE POLICY "admin traite les signalements"
  ON public.reports FOR UPDATE TO authenticated
  USING ((SELECT private.is_moderator_or_admin()))
  WITH CHECK ((SELECT private.is_moderator_or_admin()));

-- 6. Journal d'audit : écriture autorisée pour admins et modérateurs
DROP POLICY IF EXISTS "ecrire journal admin" ON public.audit_log;
CREATE POLICY "ecrire journal admin"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = (SELECT auth.uid()) AND (SELECT private.is_moderator_or_admin()));

-- 7. Table notifications (alertes nouveautés, abonnement, compte)
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'info',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_id ON public.notifications (account_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lire ses notifications" ON public.notifications;
CREATE POLICY "lire ses notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marquer notification lue" ON public.notifications;
CREATE POLICY "marquer notification lue"
  ON public.notifications FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "admin cree notifications" ON public.notifications;
CREATE POLICY "admin cree notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

-- 8. Fonctions RPC d'administration des comptes et rôles (contrôlées côté serveur)
CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  country text,
  role public.user_role,
  plan_id text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private
AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    u.email::text,
    COALESCE(a.phone, u.phone::text),
    a.country,
    a.role,
    COALESCE((
      SELECT s.plan_id
      FROM public.subscriptions s
      WHERE s.account_id = a.id AND s.status = 'active'
      ORDER BY s.id DESC
      LIMIT 1
    ), 'free') AS plan_id,
    a.created_at
  FROM public.accounts a
  LEFT JOIN auth.users u ON u.id = a.id
  ORDER BY a.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(target_id uuid, new_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF target_id = auth.uid() AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'Impossible de retirer votre propre rôle administrateur';
  END IF;
  UPDATE public.accounts SET role = new_role WHERE id = target_id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id)
  VALUES (auth.uid(), 'set_role:' || new_role::text, 'accounts', target_id::text);
END;
$$;

-- 9. Index utiles pour les performances RLS et les requêtes catalogue
CREATE INDEX IF NOT EXISTS idx_profiles_account_id ON public.profiles (account_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_profile_id ON public.watch_progress (profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rights_title_country ON public.rights (title_id, country);
CREATE INDEX IF NOT EXISTS idx_devices_account_id ON public.devices (account_id);
