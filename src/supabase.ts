import { createClient } from '@supabase/supabase-js'
// La clé « publishable » est faite pour le navigateur : elle ne donne accès qu'à ce que les règles RLS autorisent.
// Aucune clé secrète (service role) n'est jamais utilisée dans le front.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const sb = url && key ? createClient(url, key) : null
