import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet, apiPost, apiDelete } from '../api.ts'

interface SetRow { id: string; title: string; updated_at: string; problems: number }
interface StudentRow { id: string; name: string; token: string }
interface GroupMember { id: string; name: string }
interface GroupRow { id: string; name: string; members: GroupMember[] }
interface AssignmentRow {
  id: string
  title: string | null
  set_id: string
  time_limit_sec: number
  created_at: string
  assigned: number
  submitted: number
}
interface Overview {
  sets: SetRow[]
  students: StudentRow[]
  assignments: AssignmentRow[]
  groups: GroupRow[]
}

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
      <ProblemSets base={base} sets={ov.sets} onChange={reload} />
      <Students base={base} students={ov.students} onChange={reload} />
      <Groups base={base} groups={ov.groups} students={ov.students} onChange={reload} />
      <NewAssignment base={base} sets={ov.sets} students={ov.students} groups={ov.groups} onCreated={reload} />
      <Assignments base={base} assignments={ov.assignments} />
    </main>
  )
}

// --- Problem sets (upload) --------------------------------------------------
function ProblemSets({ base, sets, onChange }: { base: string; sets: SetRow[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirm, setConfirm] = useState<SetRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setBusy(true)
    setResult(null)
    setErrors([])
    try {
      const text = await file.text()
      try {
        JSON.parse(text) // fail fast on malformed JSON before hitting the server
      } catch (e) {
        setErrors([`Not valid JSON: ${(e as Error).message}`])
        return
      }
      const res = await fetch(`${base}/problem-sets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
      })
      const body = await res.json()
      if (!res.ok) {
        setErrors(body.errors ?? [body.error ?? 'Upload failed'])
        return
      }
      setResult(`${body.updated ? 'Updated' : 'Created'} “${body.title}” — ${body.problems} problems, ${body.figures} figures.`)
      onChange()
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(s: SetRow) {
    setConfirm(null)
    try {
      await apiDelete(`${base}/problem-sets/${encodeURIComponent(s.id)}`)
      onChange()
    } catch (e) {
      setErrors([(e as Error).message])
    }
  }

  return (
    <section className="panel">
      <h2>Problem sets</h2>
      <p className="muted">
        Upload a problem-set <code>.json</code> (figures are rendered on the server). Re-uploading the
        same <code>id</code> updates it in place.
      </p>
      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />
        {busy && <span className="muted">Rendering figures…</span>}
      </div>
      {result && <p className="upload-ok">✓ {result}</p>}
      {errors.length > 0 && (
        <ul className="upload-errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <ul className="card-list">
        {sets.map((s) => (
          <li key={s.id} className="card">
            <div>
              <div className="card-title">{s.title}</div>
              <div className="muted">
                <code>{s.id}</code> · {s.problems} questions
              </div>
            </div>
            <button className="danger-btn" onClick={() => setConfirm(s)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {confirm && (
        <ConfirmDialog
          title={`Delete set "${confirm.title}"?`}
          body="This removes the problem set and its problems. Blocked if any student has already answered them."
          confirmLabel="Delete set"
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
    </section>
  )
}

// --- Students ---------------------------------------------------------------
function Students({ base, students, onChange }: { base: string; students: StudentRow[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<StudentRow | null>(null)

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

  async function remove(s: StudentRow) {
    await apiDelete(`${base}/students/${s.id}`)
    setConfirm(null)
    onChange()
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
            <div className="row">
              <Copyable label="Portal link" url={`${origin()}/s/${s.token}`} />
              <button className="danger-btn" title="Delete student" onClick={() => setConfirm(s)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.name}?`}
          body="This permanently removes the student and all their homework attempts, answers, and results. This can’t be undone."
          confirmLabel="Delete student"
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      )}
    </section>
  )
}

// --- New assignment ---------------------------------------------------------
function NewAssignment({
  base,
  sets,
  students,
  groups,
  onCreated,
}: {
  base: string
  sets: SetRow[]
  students: StudentRow[]
  groups: GroupRow[]
  onCreated: () => void
}) {
  const [setId, setSetId] = useState('')
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<Array<{ studentName: string; attemptToken: string }> | null>(null)

  const chosen = students.filter((s) => picked[s.id]).map((s) => s.id)

  // Whole-group select: on if every member is currently picked.
  function groupAllPicked(g: GroupRow) {
    return g.members.length > 0 && g.members.every((m) => picked[m.id])
  }
  function toggleGroup(g: GroupRow) {
    const turnOn = !groupAllPicked(g)
    setPicked((p) => {
      const next = { ...p }
      for (const m of g.members) next[m.id] = turnOn
      return next
    })
  }

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
      {groups.length > 0 && (
        <div className="group-chips">
          <span className="muted">Quick-pick a group:</span>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`chip ${groupAllPicked(g) ? 'on' : ''}`}
              onClick={() => toggleGroup(g)}
              disabled={g.members.length === 0}
            >
              {g.name} ({g.members.length})
            </button>
          ))}
        </div>
      )}
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

// --- Groups -----------------------------------------------------------------
function Groups({
  base,
  groups,
  students,
  onChange,
}: {
  base: string
  groups: GroupRow[]
  students: StudentRow[]
  onChange: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<GroupRow | null>(null)
  const [addTo, setAddTo] = useState<Record<string, string>>({}) // groupId -> selected studentId

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await apiPost(`${base}/groups`, { name: name.trim() })
      setName('')
      onChange()
    } finally {
      setBusy(false)
    }
  }
  async function addMember(groupId: string) {
    const sid = addTo[groupId]
    if (!sid) return
    await apiPost(`${base}/groups/${groupId}/members`, { studentIds: [sid] })
    setAddTo((a) => ({ ...a, [groupId]: '' }))
    onChange()
  }
  async function removeMember(groupId: string, studentId: string) {
    await apiDelete(`${base}/groups/${groupId}/members/${studentId}`)
    onChange()
  }
  async function deleteGroup(g: GroupRow) {
    await apiDelete(`${base}/groups/${g.id}`)
    setConfirm(null)
    onChange()
  }

  return (
    <section className="panel">
      <h2>Groups</h2>
      <p className="muted">Tag students into a class so you can assign to all of them at once.</p>
      <div className="row">
        <input placeholder="Group name (e.g. Tuesday 4pm)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="nav-btn primary" onClick={create} disabled={busy}>
          Create group
        </button>
      </div>

      <ul className="card-list">
        {groups.map((g) => {
          const notIn = students.filter((s) => !g.members.some((m) => m.id === s.id))
          return (
            <li key={g.id} className="card column">
              <div className="row between">
                <div className="card-title">{g.name}</div>
                <button className="danger-btn" onClick={() => setConfirm(g)}>
                  Delete group
                </button>
              </div>
              <div className="member-chips">
                {g.members.length === 0 && <span className="muted">No members yet.</span>}
                {g.members.map((m) => (
                  <span key={m.id} className="member-chip">
                    {m.name}
                    <button className="x" title="Remove from group" onClick={() => removeMember(g.id, m.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {notIn.length > 0 && (
                <div className="row">
                  <select value={addTo[g.id] ?? ''} onChange={(e) => setAddTo((a) => ({ ...a, [g.id]: e.target.value }))}>
                    <option value="">Add student…</option>
                    {notIn.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button className="nav-btn" onClick={() => addMember(g.id)} disabled={!addTo[g.id]}>
                    Add
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {confirm && (
        <ConfirmDialog
          title={`Delete group "${confirm.name}"?`}
          body="This removes the group. The students themselves are kept."
          confirmLabel="Delete group"
          onCancel={() => setConfirm(null)}
          onConfirm={() => deleteGroup(confirm)}
        />
      )}
    </section>
  )
}

// --- shared -----------------------------------------------------------------
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
        </div>
        <p className="muted">{body}</p>
        <div className="modal-actions">
          <button className="nav-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="danger-btn solid"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              Promise.resolve(onConfirm()).finally(() => setBusy(false))
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

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
