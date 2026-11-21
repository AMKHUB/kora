-- Durcissement sécurité Kora : Storage MIME/tailles, protection video_assets, creator_channels, notifications et RPC admin

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 5242880
WHERE id = 'posters';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'],
    file_size_limit = 52428800
WHERE id = 'videos';

REVOKE EXECUTE ON FUNCTION public.admin_list_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.user_role) TO authenticated;
ALTER FUNCTION public.admin_list_accounts() SET search_path = public, auth;
ALTER FUNCTION public.admin_set_role(uuid, public.user_role) SET search_path = public;

CREATE OR REPLACE FUNCTION public.validate_video_asset_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_uid AND role = 'admin') INTO v_is_admin;

  IF NEW.storage_path IS NOT NULL THEN
    IF NEW.storage_path LIKE '%..%' OR NEW.storage_path LIKE '/%' OR NEW.storage_path LIKE '%\%' THEN
      RAISE EXCEPTION 'Chemin de stockage vidéo invalide';
    END IF;
    IF NOT v_is_admin AND NEW.storage_path !~ ('^creator/' || v_uid::text || '/[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Un créateur ne peut référencer que ses propres fichiers vidéo';
    END IF;
  END IF;

  IF NOT v_is_admin AND NEW.hls_url IS NOT NULL THEN
    RAISE EXCEPTION 'Seul un administrateur peut définir une URL HLS externe';
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_validate_video_asset_owner
    BEFORE INSERT OR UPDATE ON public.video_assets
    FOR EACH ROW EXECUTE FUNCTION public.validate_video_asset_owner();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.protect_creator_channel_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF TG_OP = 'INSERT' THEN NEW.verified := false;
    ELSIF TG_OP = 'UPDATE' AND NEW.verified IS DISTINCT FROM OLD.verified THEN NEW.verified := OLD.verified;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_protect_creator_channel_verified
    BEFORE INSERT OR UPDATE ON public.creator_channels
    FOR EACH ROW EXECUTE FUNCTION public.protect_creator_channel_verified();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.protect_notification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    NEW.title := OLD.title;
    NEW.body := OLD.body;
    NEW.kind := OLD.kind;
    NEW.link := OLD.link;
    NEW.account_id := OLD.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_protect_notification_columns
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.protect_notification_columns();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
