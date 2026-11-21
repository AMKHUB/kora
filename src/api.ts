// Client interne same-origin : aucune clé API ni service externe dans le code front-end.
// Toutes les requêtes authentifiées utilisent des cookies __Host- HttpOnly + en-tête anti-CSRF X-Kora-Request.

export type AuthUser = {
  id: string
  email: string
  phone: string
  name: string
  provider: string
}

export type ApiResponse<T = any> = {
  ok: boolean
  status: number
  data: T & { error?: string; message?: string }
}

const AUTH_ERROR_CODES: Record<string, string> = {
  oauth_denied: 'Connexion Google annulée ou refusée.',
  oauth_failed: 'Impossible de finaliser la connexion Google. Veuillez réessayer.',
  link_expired: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau ci-dessous.',
  session_expired: 'Votre session de vérification a expiré. Veuillez recommencer.'
}

export function authErrorMessage(code: string | null | undefined): string {
  if (!code) return ''
  return AUTH_ERROR_CODES[code] || 'Une erreur de vérification est survenue. Veuillez réessayer.'
}

export async function apiGet<T = any>(path: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-Kora-Request': '1' }
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Impossible de joindre le serveur Kora.' } as any }
  }
}

export async function apiPost<T = any>(path: string, body: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Kora-Request': '1'
      },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Impossible de joindre le serveur Kora.' } as any }
  }
}

export async function uploadFileToSignedUrl(signedUrl: string, file: File): Promise<{ ok: boolean; error?: string }> {
  try {
    const isR2 = signedUrl.includes('r2.cloudflarestorage.com') || signedUrl.includes('X-Amz-Signature=')
    let res: Response
    if (isR2) {
      res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file
      })
    } else {
      const fd = new FormData()
      fd.append('cacheControl', '3600')
      fd.append('', file)
      res = await fetch(signedUrl, { method: 'PUT', body: fd })
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      const large = /exceed|size|large|413/i.test(txt) || res.status === 413
      return {
        ok: false,
        error: large
          ? (isR2 ? 'Fichier trop volumineux (limite 5 Go sur Cloudflare R2).' : 'Fichier trop volumineux (limite 50 Mo).')
          : `Échec du téléversement (${res.status}).`
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Erreur réseau lors du téléversement du fichier.' }
  }
}

export async function consumeAuthRedirectTokens(): Promise<{
  handled: boolean
  flow?: 'confirm' | 'recovery' | 'google'
  errCode?: string
}> {
  const search = new URLSearchParams(location.search)
  const rawHash = location.hash.replace(/^#/, '')
  const hashLooksAuth = rawHash.includes('access_token=') || rawHash.includes('error_description=')
  const hashParams = hashLooksAuth ? new URLSearchParams(rawHash) : new URLSearchParams()

  const errDesc = hashParams.get('error_description') || hashParams.get('error') || search.get('error_description') || search.get('error')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') || ''
  const tokenHash = search.get('token_hash')
  const code = search.get('code')
  const type = hashParams.get('type') || search.get('type') || ''
  const authFlow = search.get('auth_flow') || ''

  if (!errDesc && !accessToken && !tokenHash && !code) {
    return { handled: false }
  }

  const flow: 'confirm' | 'recovery' | 'google' =
    type === 'recovery' || authFlow === 'recovery'
      ? 'recovery'
      : type === 'signup' || type === 'email' || authFlow === 'confirm'
        ? 'confirm'
        : 'google'

  history.replaceState(null, '', location.pathname)

  if (errDesc) {
    return { handled: true, flow, errCode: flow === 'google' ? 'oauth_denied' : 'link_expired' }
  }

  const res = await apiPost('/api/auth?action=verify-hash', {
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    token_hash: tokenHash || undefined,
    type: type || undefined,
    code: code || undefined
  })

  if (!res.ok) {
    return { handled: true, flow, errCode: 'link_expired' }
  }
  return { handled: true, flow }
}
