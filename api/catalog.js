import { catalog as fallbackCatalog } from '../server/catalog.js'
import { buildCatalogPayload, createAnonClient } from '../server/supabaseServer.js'

export default async function handler(_req, res) {
  const sb = createAnonClient()
  if (sb) {
    const { data, error } = await sb
      .from('titles')
      .select('id,type,title,synopsis_short,synopsis_long,year,duration_min,country,age_rating,poster_url,backdrop_url,trailer_url,is_trending,is_new,is_exclusive,title_genres(genres(name)),title_people(role,position,people(name)),title_languages(kind,languages(name)),seasons(number,episodes(id,number,title,synopsis,duration_min,intro_end_sec))')
      .eq('status', 'published')
      .not('poster_url', 'is', null)
      .neq('poster_url', '')
      .order('id', { ascending: false })

    if (!error) {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
      return res.status(200).json(buildCatalogPayload(data || []))
    }
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  res.status(200).json(fallbackCatalog)
}
