import { useEffect, useState } from 'react'

type Health = { ok: boolean; db: boolean; now?: string; error?: string }

// A tiny landing page that pings /api/health, proving the client <-> server
// <-> Postgres wiring is sound. Replaced with real content later.
export function Home() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealth({ ok: false, db: false, error: String(e) }))
  }, [])

  return (
    <main className="page">
      <h1>SAT Homework</h1>
      <p className="muted">BlueBook-style homework runner — scaffold is up.</p>
      <div className="status">
        <Row label="Server" ok={!!health?.ok} />
        <Row
          label="Database"
          ok={!!health?.db}
          detail={health?.error ?? (health?.now ? `connected · ${health.now}` : undefined)}
        />
      </div>
    </main>
  )
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="status-row">
      <span className={ok ? 'dot dot-ok' : 'dot dot-bad'} />
      <strong>{label}</strong>
      {detail && <span className="muted"> — {detail}</span>}
    </div>
  )
}
