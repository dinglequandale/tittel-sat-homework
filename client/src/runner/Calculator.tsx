import { useEffect, useRef, useState } from 'react'

// Lazy-load the real Desmos graphing calculator on first open (not at page load).
// Same approach as the whiteboard. Falls back to a message if the script blocks.
type DesmosGlobal = {
  GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => { destroy: () => void }
}

let desmosPromise: Promise<DesmosGlobal> | null = null

function loadDesmos(): Promise<DesmosGlobal> {
  const w = window as unknown as { Desmos?: DesmosGlobal }
  if (w.Desmos) return Promise.resolve(w.Desmos)
  if (!desmosPromise) {
    desmosPromise = new Promise((resolve, reject) => {
      const key = import.meta.env.VITE_DESMOS_API_KEY || 'dcb31709b452b1cf9dc26972add0fda6'
      const s = document.createElement('script')
      s.src = `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${key}`
      s.async = true
      s.onload = () => (w.Desmos ? resolve(w.Desmos) : reject(new Error('Desmos missing')))
      s.onerror = () => reject(new Error('Desmos failed to load'))
      document.head.appendChild(s)
    })
  }
  return desmosPromise
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let calc: { destroy: () => void } | null = null
    let cancelled = false
    loadDesmos()
      .then((D) => {
        if (cancelled || !host.current) return
        calc = D.GraphingCalculator(host.current, { expressionsCollapsed: false })
      })
      .catch(() => setError(true))
    return () => {
      cancelled = true
      try {
        calc?.destroy()
      } catch {
        /* ignore */
      }
    }
  }, [])

  return (
    <div className="calc-panel" role="dialog" aria-label="Calculator">
      <div className="calc-head">
        <span>Calculator</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close calculator">
          ×
        </button>
      </div>
      {error ? (
        <div className="calc-error">Couldn’t load Desmos (check your connection).</div>
      ) : (
        <div className="calc-body" ref={host} />
      )}
    </div>
  )
}
