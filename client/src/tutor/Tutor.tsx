import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet, apiPost } from '../api.ts'

interface SetRow { id: string; title: string; updated_at: string; problems: number }
interface StudentRow { id: string; name: string; token: string }
interface AssignmentRow {
  id: string
  title: string | null
  set_id: string
  time_limit_sec: number
  created_at: string
  assigned: number
  submitted: number
}
interface Overview { sets: SetRow[]; students: StudentRow[]; assignments: AssignmentRow[] }

interface ProblemStat {
  problemId: string
  ordinal: number
  type: 'mc' | 'grid'
  stem: string
  attempts: number
  answered: number
  correct: number
  pctCorrect: number | null
  avgTimeMs: number
}
interface StudentStat { studentName: string; status: string; score: number; total: number; totalTimeMs: number }
interface Analytics {
  title: string | null
  setTitle: string
  setId: string
  assigned: number
  submitted: number
  perProblem: ProblemStat[]
  perStudent: StudentStat[]
}

function origin() {
  return window.location.origin
}

function download(filename: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function Tutor() {
  const { secret } = useParams()
  const base = `/api/tutor/${secret}`
  const [ov, setOv] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    apiGet<Overview>(`${base}/overview`).then(setOv).catch((e) => setError(e.message))
  }
  useEffect(reload, [secret])

  if (error) return <main className="page"><h1>Tutor</h1><p className="muted">{error}</p></main>
  if (!ov) return <main className="page"><p className="muted">Loading…</p></main>

  return (
    <main className="page tutor">
      <h1>Tutor dashboard</h1>
      <Students base={base} students={ov.students} onChange={reload} />
      <NewAssignment base={base} sets={ov.sets} students={ov.students} onCreated={reload} />
      <Assignments base={base} assignments={ov.assignments} />
    </main>
  )
}

// --- Students ---------------------------------------------------------------
function Students({ base, students, onChange }: { base: string; students: StudentRow[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await apiPost(`${base}/students`, { name: name.trim() })
      setName('')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Students</h2>
      <div className="row">
        <input placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="nav-btn primary" onClick={add} disabled={busy}>
          Add
        </button>
      </div>
      <ul className="card-list">
        {students.map((s) => (
          <li key={s.id} className="card">
            <div className="card-title">{s.name}</div>
            <Copyable label="Portal link" url={`${origin()}/s/${s.token}`} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- New assignment ---------------------------------------------------------
function NewAssignment({
  base,
  sets,
  students,
  onCreated,
}: {
  base: string
  sets: SetRow[]
  students: StudentRow[]
  onCreated: () => void
}) {
  const [setId, setSetId] = useState('')
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<Array<{ studentName: string; attemptToken: string }> | null>(null)

  const chosen = students.filter((s) => picked[s.id]).map((s) => s.id)

  async function create() {
    if (!setId || chosen.length === 0) return
    setBusy(true)
    try {
      const res = await apiPost<{ links: Array<{ studentName: string; attemptToken: string }> }>(
        `${base}/assignments`,
        { setId, title: title.trim() || null, timeLimitSec: minutes * 60, studentIds: chosen },
      )
      setLinks(res.links)
      setPicked({})
      setTitle('')
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Assign homework</h2>
      <div className="form-grid">
        <label>
          Problem set
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            <option value="">Choose…</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.problems} q)
              </option>
            ))}
          </select>
        </label>
        <label>
          Title (optional)
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 — Algebra" />
        </label>
        <label>
          Time limit (min)
          <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 15)} />
        </label>
      </div>
      <div className="pick-students">
        <div className="muted">Assign to:</div>
        {students.length === 0 && <span className="muted">Add a student first.</span>}
        {students.map((s) => (
          <label key={s.id} className="chk">
            <input
              type="checkbox"
              checked={!!picked[s.id]}
              onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
            />
            {s.name}
          </label>
        ))}
      </div>
      <button className="nav-btn primary" onClick={create} disabled={busy || !setId || chosen.length === 0}>
        {busy ? 'Creating…' : 'Create assignment'}
      </button>

      {links && (
        <div className="links-out">
          <div className="muted">Send each student their link:</div>
          <ul className="card-list">
            {links.map((l) => (
              <li key={l.attemptToken} className="card">
                <div className="card-title">{l.studentName}</div>
                <Copyable label="Homework link" url={`${origin()}/hw/${l.attemptToken}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// --- Assignments + analytics ------------------------------------------------
function Assignments({ base, assignments }: { base: string; assignments: AssignmentRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="panel">
      <h2>Assignments</h2>
      {assignments.length === 0 && <p className="muted">None yet.</p>}
      <ul className="card-list">
        {assignments.map((a) => (
          <li key={a.id} className="card column">
            <div className="row between">
              <div>
                <div className="card-title">{a.title || a.set_id}</div>
                <div className="muted">
                  {a.submitted}/{a.assigned} submitted · {Math.round(a.time_limit_sec / 60)} min
                </div>
              </div>
              <button className="nav-btn" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                {openId === a.id ? 'Hide' : 'Analytics'}
              </button>
            </div>
            {openId === a.id && <AnalyticsPanel base={base} assignmentId={a.id} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function AnalyticsPanel({ base, assignmentId }: { base: string; assignmentId: string }) {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    apiGet<Analytics>(`${base}/assignments/${assignmentId}/analytics`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [base, assignmentId])

  if (error) return <p className="muted">{error}</p>
  if (!data) return <p className="muted">Loading analytics…</p>

  const withData = data.perProblem.filter((p) => p.attempts > 0)
  const worstPct = withData.length ? Math.min(...withData.map((p) => p.pctCorrect ?? 1)) : null
  const slowest = withData.length ? Math.max(...withData.map((p) => p.avgTimeMs)) : null
  const chosen = data.perProblem.filter((p) => picked[p.problemId]).map((p) => p.problemId)

  async function exportLesson() {
    if (chosen.length === 0) return
    const doc = await apiPost(`${base}/lesson-export`, {
      problemIds: chosen,
      title: data?.title ? `${data.title} — Review` : 'Homework Review',
    })
    download('homework-review.lesson.json', doc)
  }

  return (
    <div className="analytics">
      <div className="muted summary">
        {data.submitted}/{data.assigned} submitted · set: {data.setTitle}
      </div>

      <table className="stat-table">
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <th>Type</th>
            <th>Correct</th>
            <th>Avg time</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {data.perProblem.map((p) => {
            const pct = p.pctCorrect == null ? null : Math.round(p.pctCorrect * 100)
            const isWorst = worstPct != null && p.attempts > 0 && (p.pctCorrect ?? 1) === worstPct
            const isSlow = slowest != null && p.attempts > 0 && p.avgTimeMs === slowest && slowest > 0
            return (
              <tr key={p.problemId}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!picked[p.problemId]}
                    onChange={(e) => setPicked((x) => ({ ...x, [p.problemId]: e.target.checked }))}
                  />
                </td>
                <td>{p.ordinal + 1}</td>
                <td>{p.type}</td>
                <td>{pct == null ? '—' : `${pct}% (${p.correct}/${p.attempts})`}</td>
                <td>{p.avgTimeMs ? `${Math.round(p.avgTimeMs / 1000)}s` : '—'}</td>
                <td>
                  {isWorst && <span className="tag bad">most missed</span>}
                  {isSlow && <span className="tag">slowest</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <button className="nav-btn primary" onClick={exportLesson} disabled={chosen.length === 0}>
        Export {chosen.length || ''} to lesson plan
      </button>

      <h3>Per student</h3>
      <table className="stat-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Score</th>
            <th>Total time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.perStudent.map((s, i) => (
            <tr key={i}>
              <td>{s.studentName}</td>
              <td>{s.score}/{s.total}</td>
              <td>{Math.round(s.totalTimeMs / 1000)}s</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- shared -----------------------------------------------------------------
function Copyable({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="copyable"
      title={url}
      onClick={() => {
        navigator.clipboard?.writeText(url).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          },
          () => {},
        )
      }}
    >
      {copied ? '✓ Copied' : `📋 ${label}`}
    </button>
  )
}
