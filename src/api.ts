// Client interne same-origin : aucune clé API ni service externe dans le code front-end.
// Toutes les requêtes authentifiées utilisent des cookies HttpOnly gérés exclusivement par le serveur (/api/*).

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

export async function apiGet<T = any>(path: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, { method: 'GET', credentials: 'same-origin' })
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
      headers: { 'Content-Type': 'application/json' },
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
    const fd = new FormData()
    fd.append('cacheControl', '3600')
    fd.append('', file)
    const res = await fetch(signedUrl, { method: 'PUT', body: fd })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      const large = /exceed|size|large|413/i.test(txt) || res.status === 413
      return { ok: false, error: large ? 'Fichier trop volumineux (limite 50 Mo).' : `Échec du téléversement (${res.status}).` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Erreur réseau lors du téléversement du fichier.' }
  }
}

export async function consumeAuthRedirectTokens(): Promise<{
  handled: boolean
  flow?: 'confirm' | 'recovery' | 'google'
  error?: string
}> {
  const search = new URLSearchParams(location.search)
  const rawHash = location.hash.replace(/^#/, '')
  const hashLooksAuth = rawHash.includes('access_token=') || rawHash.includes('error_description=')
  const hashParams = hashLooksAuth ? new URLSearchParams(rawHash) : new URLSearchParams()

  const errDesc = hashParams.get('error_description') || hashParams.get('error') || search.get('error_description') || search.get('error')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') || ''
  const expiresIn = hashParams.get('expires_in') || ''
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

  // Nettoyer immédiatement les jetons sensibles de la barre d'adresse
  const cleanPath = location.pathname
  history.replaceState(null, '', cleanPath)

  if (errDesc) {
    return { handled: true, flow, error: decodeURIComponent(errDesc.replace(/\+/g, ' ')) }
  }

  const res = await apiPost('/api/auth?action=verify-hash', {
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    expires_in: expiresIn ? Number(expiresIn) : undefined,
    token_hash: tokenHash || undefined,
    type: type || undefined,
    code: code || undefined
  })

  if (!res.ok) {
    return { handled: true, flow, error: res.data.error || 'Lien invalide ou expiré.' }
  }
  return { handled: true, flow }
}
