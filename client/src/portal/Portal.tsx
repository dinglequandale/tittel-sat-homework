import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiGet } from '../api.ts'

interface PortalAssignment {
  assignment_id: string
  title: string | null
  time_limit_sec: number
  created_at: string
  set_title: string
  attempt_token: string | null
  status: 'not_started' | 'in_progress' | 'submitted' | 'expired'
  total: number
  score: number
}
interface PortalData {
  studentName: string
  assignments: PortalAssignment[]
}

export function Portal() {
  const { token } = useParams()
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    apiGet<PortalData>(`/api/portal/${token}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [token])

  if (error) return <Shell><h1>Portal</h1><p className="muted">{error}</p></Shell>
  if (!data) return <Shell><p className="muted">Loading…</p></Shell>

  const todo = data.assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress')
  const done = data.assignments.filter((a) => a.status === 'submitted' || a.status === 'expired')

  return (
    <Shell>
      <h1>Hi, {data.studentName}</h1>

      <section>
        <h2>To do</h2>
        {todo.length === 0 && <p className="muted">Nothing assigned right now.</p>}
        <ul className="card-list">
          {todo.map((a) => (
            <li key={a.assignment_id} className="card">
              <div>
                <div className="card-title">{a.title || a.set_title}</div>
                <div className="muted">
                  {Math.round(a.time_limit_sec / 60)} min · {a.total} questions
                </div>
              </div>
              {a.attempt_token ? (
                <Link className="nav-btn primary" to={`/hw/${a.attempt_token}`}>
                  {a.status === 'in_progress' ? 'Resume' : 'Start'}
                </Link>
              ) : (
                <span className="muted">no link</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Completed</h2>
        {done.length === 0 && <p className="muted">No finished homework yet.</p>}
        <ul className="card-list">
          {done.map((a) => (
            <li key={a.assignment_id} className="card">
              <div>
                <div className="card-title">{a.title || a.set_title}</div>
                <div className="muted">
                  Score: {a.score}/{a.total}
                  {a.status === 'expired' && ' · time expired'}
                </div>
              </div>
              {a.attempt_token && (
                <Link className="nav-btn" to={`/review/${a.attempt_token}`}>
                  Review
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="page portal">{children}</main>
}
