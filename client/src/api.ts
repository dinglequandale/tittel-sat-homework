// Thin fetch helpers. Same-origin in prod; Vite proxies /api in dev.

async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `HTTP ${r.status}`)
  }
  return r.json() as Promise<T>
}

export function apiGet<T>(url: string): Promise<T> {
  return fetch(url).then((r) => parse<T>(r))
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then((r) => parse<T>(r))
}

export function apiDelete<T>(url: string): Promise<T> {
  return fetch(url, { method: 'DELETE' }).then((r) => parse<T>(r))
}
