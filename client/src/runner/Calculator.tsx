import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

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

// The floating panel's position/size, in CSS pixels (top-left anchored).
type Geom = { x: number; y: number; w: number; h: number }

// Opens large, on the left, leaving room for the question panel to shift right.
function defaultGeom(): Geom {
  const w = Math.min(640, window.innerWidth * 0.46)
  const h = Math.min(700, window.innerHeight - 150)
  return { x: 24, y: 84, w, h }
}

// Keep at least a sliver on-screen so the panel can always be grabbed back.
function clampPos(g: Geom): Geom {
  const margin = 40
  return {
    ...g,
    x: Math.min(Math.max(g.x, margin - g.w), window.innerWidth - margin),
    y: Math.min(Math.max(g.y, 0), window.innerHeight - margin),
  }
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  const [geom, setGeom] = useState<Geom>(defaultGeom)
  const geomRef = useRef(geom)
  geomRef.current = geom

  // Capture native resize-handle drags (CSS `resize: both`) back into geom.
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      const g = geomRef.current
      if (w !== g.w || h !== g.h) setGeom({ ...g, w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Drag the panel by its header.
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const base = geomRef.current
    const onMove = (ev: PointerEvent) =>
      setGeom(clampPos({ ...base, x: base.x + (ev.clientX - startX), y: base.y + (ev.clientY - startY) }))
    const onUp = () => {
      el.releasePointerCapture?.(e.pointerId)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

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
    <div
      ref={panelRef}
      className="calc-panel"
      role="dialog"
      aria-label="Calculator"
      style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h, right: 'auto', bottom: 'auto' }}
    >
      <div className="calc-head" onPointerDown={startDrag}>
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
