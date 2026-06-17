import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiGet, apiPost } from '../api.ts'
import { RichText } from '../RichText.tsx'
import { Calculator } from './Calculator.tsx'
import { Reference } from './Reference.tsx'

interface RChoice { id: string; content: string }
interface RProblem {
  id: string
  ordinal: number
  type: 'mc' | 'grid'
  stem: string
  choices: RChoice[]
  figures: Record<string, string>
}
interface SavedResponse { problem_id: string; answer: string | null; marked_for_review: boolean }
interface AttemptPayload {
  status: string
  submitted: boolean
  studentName: string
  assignmentTitle: string | null
  timeLimitSec: number
  remainingSec: number
  problems: RProblem[]
  responses: SavedResponse[]
}

function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function Runner() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState<AttemptPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [marked, setMarked] = useState<Record<string, boolean>>({})
  const [eliminated, setEliminated] = useState<Record<string, Record<string, boolean>>>({})
  const [remaining, setRemaining] = useState(0)
  const [calcOpen, setCalcOpen] = useState(false)
  const [refOpen, setRefOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [timerHidden, setTimerHidden] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Refs for latest values (avoid stale closures in time-flush + autosave).
  const answersRef = useRef(answers)
  answersRef.current = answers
  const markedRef = useRef(marked)
  markedRef.current = marked
  const timeRef = useRef<{ problemId: string; at: number } | null>(null)
  const autoRef = useRef(false)
  const gridTimer = useRef<number | undefined>(undefined)

  // Initial load.
  useEffect(() => {
    if (!token) return
    apiGet<AttemptPayload>(`/api/attempt/${token}`)
      .then((d) => {
        setData(d)
        setRemaining(d.remainingSec)
        const a: Record<string, string> = {}
        const m: Record<string, boolean> = {}
        for (const r of d.responses) {
          if (r.answer != null) a[r.problem_id] = r.answer
          if (r.marked_for_review) m[r.problem_id] = true
        }
        setAnswers(a)
        setMarked(m)
      })
      .catch((e) => setError(e.message))
  }, [token])

  // Autosave one response (merges current ref state so a time-only flush won't
  // clobber the answer).
  function save(
    problemId: string,
    opts: { answer?: string | null; marked?: boolean; timeDelta?: number; changed?: boolean },
  ) {
    const answer = opts.answer !== undefined ? opts.answer : answersRef.current[problemId] ?? null
    const markedForReview = opts.marked !== undefined ? opts.marked : !!markedRef.current[problemId]
    void apiPost(`/api/attempt/${token}/response`, {
      problemId,
      answer,
      markedForReview,
      timeSpentMsDelta: opts.timeDelta ?? 0,
      changed: !!opts.changed,
    }).catch(() => {})
  }

  function flushTimeFor(problemId: string) {
    const t = timeRef.current
    if (!t || t.problemId !== problemId) return
    const delta = Date.now() - t.at
    timeRef.current = null
    if (delta >= 250) save(problemId, { timeDelta: delta })
  }

  // Track time on the current question; flush it when leaving (or unmounting).
  useEffect(() => {
    if (!data || data.submitted) return
    const p = data.problems[idx]
    if (!p) return
    timeRef.current = { problemId: p.id, at: Date.now() }
    return () => flushTimeFor(p.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, data])

  // Countdown.
  useEffect(() => {
    if (!data || data.submitted) return
    const h = window.setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000)
    return () => window.clearInterval(h)
  }, [data])

  // Auto-submit when the clock runs out.
  useEffect(() => {
    if (!data || data.submitted) return
    if (remaining <= 0 && !autoRef.current) {
      autoRef.current = true
      void doSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, data])

  async function doSubmit() {
    setSubmitting(true)
    const cur = data?.problems[idx]
    if (cur) flushTimeFor(cur.id)
    try {
      await apiPost(`/api/attempt/${token}/submit`)
      navigate(`/review/${token}`)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <main className="page">
        <h1>Couldn’t open this homework</h1>
        <p className="muted">{error}</p>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    )
  }
  if (data.submitted) {
    return (
      <main className="page">
        <h1>Already submitted</h1>
        <p className="muted">This attempt is complete.</p>
        <p>
          <Link to={`/review/${token}`}>Review your answers →</Link>
        </p>
      </main>
    )
  }

  const problems = data.problems
  const p = problems[idx]
  const answeredCount = problems.filter((q) => answers[q.id] != null && answers[q.id] !== '').length
  const unanswered = problems.length - answeredCount

  function selectChoice(choiceId: string) {
    const prev = answersRef.current[p.id]
    setAnswers((a) => ({ ...a, [p.id]: choiceId }))
    save(p.id, { answer: choiceId, changed: prev !== undefined && prev !== choiceId })
  }

  function setGrid(value: string) {
    const prev = answersRef.current[p.id]
    setAnswers((a) => ({ ...a, [p.id]: value }))
    window.clearTimeout(gridTimer.current)
    gridTimer.current = window.setTimeout(
      () => save(p.id, { answer: value, changed: !!prev && prev !== value }),
      700,
    )
  }
  function flushGrid() {
    window.clearTimeout(gridTimer.current)
    save(p.id, { answer: answersRef.current[p.id] ?? '' })
  }

  function toggleMark() {
    const next = !markedRef.current[p.id]
    setMarked((m) => ({ ...m, [p.id]: next }))
    save(p.id, { marked: next })
  }

  function toggleEliminate(choiceId: string) {
    setEliminated((e) => ({
      ...e,
      [p.id]: { ...(e[p.id] || {}), [choiceId]: !(e[p.id]?.[choiceId]) },
    }))
  }

  function go(i: number) {
    setIdx(Math.max(0, Math.min(problems.length - 1, i)))
    setNavOpen(false)
  }

  return (
    <div className="runner">
      <header className="runner-head">
        <div className="rh-left">{data.assignmentTitle || 'SAT Homework'}</div>
        <div className="rh-center">
          {!timerHidden && <span className="timer">{mmss(remaining)}</span>}
          <button className="text-btn" onClick={() => setTimerHidden((h) => !h)}>
            {timerHidden ? 'Show' : 'Hide'}
          </button>
        </div>
        <div className="rh-right">
          <button className="tool-btn" onClick={() => setCalcOpen((v) => !v)}>
            Calculator
          </button>
          <button className="tool-btn" onClick={() => setRefOpen(true)}>
            Reference
          </button>
        </div>
      </header>

      <main className="runner-body">
        <article className="question">
          <div className="q-toolbar">
            <span className="q-number">{idx + 1}</span>
            <button className={`mark-btn ${marked[p.id] ? 'on' : ''}`} onClick={toggleMark}>
              {marked[p.id] ? '★ Marked for Review' : '☆ Mark for Review'}
            </button>
          </div>

          <div className="q-stem">
            <RichText text={p.stem} figures={p.figures} />
          </div>

          {p.type === 'mc' ? (
            <ul className="choices">
              {p.choices.map((c) => {
                const sel = answers[p.id] === c.id
                const elim = !!eliminated[p.id]?.[c.id]
                return (
                  <li key={c.id} className={`choice ${sel ? 'selected' : ''} ${elim ? 'eliminated' : ''}`}>
                    <button className="choice-main" onClick={() => selectChoice(c.id)}>
                      <span className="choice-letter">{c.id}</span>
                      <span className="choice-content">
                        <RichText text={c.content} figures={p.figures} />
                      </span>
                    </button>
                    <button
                      className="elim-btn"
                      title={elim ? 'Undo cross-out' : 'Cross out'}
                      onClick={() => toggleEliminate(c.id)}
                    >
                      {elim ? '↺' : '⊘'}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="grid-in">
              <label>
                Your answer:
                <input
                  type="text"
                  inputMode="text"
                  value={answers[p.id] ?? ''}
                  onChange={(e) => setGrid(e.target.value)}
                  onBlur={flushGrid}
                  placeholder="e.g. 12.5 or 5/2"
                />
              </label>
            </div>
          )}
        </article>
      </main>

      {calcOpen && <Calculator onClose={() => setCalcOpen(false)} />}
      {refOpen && <Reference onClose={() => setRefOpen(false)} />}

      <footer className="runner-foot">
        <div className="rf-left">{data.studentName}</div>
        <div className="rf-center">
          <button className="nav-pill" onClick={() => setNavOpen((v) => !v)}>
            Question {idx + 1} of {problems.length} ▾
          </button>
        </div>
        <div className="rf-right">
          <button className="nav-btn" disabled={idx === 0} onClick={() => go(idx - 1)}>
            Back
          </button>
          {idx < problems.length - 1 ? (
            <button className="nav-btn primary" onClick={() => go(idx + 1)}>
              Next
            </button>
          ) : (
            <button className="nav-btn primary" onClick={() => setConfirmOpen(true)}>
              Submit
            </button>
          )}
        </div>
      </footer>

      {navOpen && (
        <div className="nav-popup">
          <div className="nav-grid">
            {problems.map((q, i) => {
              const ans = answers[q.id] != null && answers[q.id] !== ''
              return (
                <button
                  key={q.id}
                  className={`nav-cell ${i === idx ? 'current' : ''} ${ans ? 'answered' : ''} ${marked[q.id] ? 'marked' : ''}`}
                  onClick={() => go(i)}
                >
                  {i + 1}
                  {marked[q.id] && <span className="flag">★</span>}
                </button>
              )
            })}
          </div>
          <button className="nav-btn primary wide" onClick={() => { setNavOpen(false); setConfirmOpen(true) }}>
            Review &amp; Submit
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Submit homework?</strong>
            </div>
            <p>
              You answered <strong>{answeredCount}</strong> of <strong>{problems.length}</strong>.
              {unanswered > 0 && ` ${unanswered} left blank.`}
            </p>
            <p className="muted">You can’t change answers after submitting.</p>
            <div className="modal-actions">
              <button className="nav-btn" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                Keep working
              </button>
              <button className="nav-btn primary" onClick={doSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
