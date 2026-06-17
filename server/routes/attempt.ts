import { Router } from 'express'
import { pool } from '../db.ts'
import { gradeMc, gradeGrid } from '../grade.ts'

export const attemptRouter = Router()

interface AttemptRow {
  id: string
  status: 'not_started' | 'in_progress' | 'submitted' | 'expired'
  started_at: string | null
  time_limit_sec: number
  set_id: string
  assignment_title: string | null
  student_name: string
}

async function loadAttempt(token: string): Promise<AttemptRow | undefined> {
  const { rows } = await pool.query(
    `select a.id, a.status, a.started_at, asg.time_limit_sec, asg.set_id,
            asg.title as assignment_title, s.name as student_name
       from attempts a
       join assignments asg on asg.id = a.assignment_id
       join students s on s.id = a.student_id
      where a.token = $1`,
    [token],
  )
  return rows[0]
}

function remainingSeconds(at: AttemptRow): number {
  if (!at.started_at) return at.time_limit_sec
  const elapsed = (Date.now() - new Date(at.started_at).getTime()) / 1000
  return at.time_limit_sec - elapsed
}

// Grade every problem in the set against the attempt's saved responses, writing
// is_correct (and creating rows for unanswered problems so analytics count them).
async function gradeAttempt(attemptId: string, setId: string): Promise<void> {
  const { rows: problems } = await pool.query(
    `select id, type, correct, answers from problems where set_id = $1`,
    [setId],
  )
  const { rows: responses } = await pool.query(
    `select problem_id, answer from responses where attempt_id = $1`,
    [attemptId],
  )
  const answerOf = new Map<string, string | null>(responses.map((r) => [r.problem_id, r.answer]))
  for (const p of problems) {
    const ans = answerOf.get(p.id) ?? null
    const isCorrect = p.type === 'mc' ? gradeMc(p.correct, ans) : gradeGrid(p.answers, ans)
    await pool.query(
      `insert into responses (attempt_id, problem_id, answer, is_correct)
       values ($1, $2, $3, $4)
       on conflict (attempt_id, problem_id) do update set is_correct = excluded.is_correct`,
      [attemptId, p.id, ans, isCorrect],
    )
  }
}

// GET the runner payload. Starts the server-authoritative timer on first open;
// auto-submits if the window has already elapsed. Never returns correct answers.
attemptRouter.get('/:token', async (req, res) => {
  const at = await loadAttempt(req.params.token)
  if (!at) return res.status(404).json({ error: 'not found' })

  if (at.status === 'not_started') {
    await pool.query(
      `update attempts set status = 'in_progress', started_at = now()
        where id = $1 and started_at is null`,
      [at.id],
    )
    at.status = 'in_progress'
    at.started_at = new Date().toISOString()
  }

  if (at.status === 'in_progress' && remainingSeconds(at) <= 0) {
    await gradeAttempt(at.id, at.set_id)
    await pool.query(`update attempts set status = 'expired', submitted_at = now() where id = $1`, [at.id])
    at.status = 'expired'
  }

  const { rows: problems } = await pool.query(
    `select id, ordinal, type, stem, choices, figures
       from problems where set_id = $1 order by ordinal`,
    [at.set_id],
  )
  const { rows: responses } = await pool.query(
    `select problem_id, answer, marked_for_review from responses where attempt_id = $1`,
    [at.id],
  )

  res.json({
    status: at.status,
    submitted: at.status === 'submitted' || at.status === 'expired',
    studentName: at.student_name,
    assignmentTitle: at.assignment_title,
    timeLimitSec: at.time_limit_sec,
    remainingSec: Math.max(0, Math.floor(remainingSeconds(at))),
    problems,
    responses,
  })
})

// Autosave one answer. Accumulates per-question time + change count (analytics).
attemptRouter.post('/:token/response', async (req, res) => {
  const at = await loadAttempt(req.params.token)
  if (!at) return res.status(404).json({ error: 'not found' })
  if (at.status !== 'in_progress') return res.status(409).json({ error: 'not in progress' })
  if (remainingSeconds(at) < -5) return res.status(409).json({ error: 'time expired' })

  const { problemId, answer, markedForReview, timeSpentMsDelta, changed } = req.body ?? {}
  if (typeof problemId !== 'string') return res.status(400).json({ error: 'problemId required' })
  const delta = Math.max(0, Math.floor(Number(timeSpentMsDelta) || 0))

  await pool.query(
    `insert into responses (attempt_id, problem_id, answer, marked_for_review, time_spent_ms, change_count)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (attempt_id, problem_id) do update set
       answer = excluded.answer,
       marked_for_review = excluded.marked_for_review,
       time_spent_ms = responses.time_spent_ms + $5,
       change_count = responses.change_count + $6,
       updated_at = now()`,
    [at.id, problemId, answer ?? null, !!markedForReview, delta, changed ? 1 : 0],
  )
  res.json({ ok: true })
})

// Submit (final). Grades and locks.
attemptRouter.post('/:token/submit', async (req, res) => {
  const at = await loadAttempt(req.params.token)
  if (!at) return res.status(404).json({ error: 'not found' })
  if (at.status === 'submitted' || at.status === 'expired') return res.json({ ok: true, already: true })
  await gradeAttempt(at.id, at.set_id)
  await pool.query(`update attempts set status = 'submitted', submitted_at = now() where id = $1`, [at.id])
  res.json({ ok: true })
})

// Review (only after submit). Returns correct answers + explanations.
attemptRouter.get('/:token/review', async (req, res) => {
  const at = await loadAttempt(req.params.token)
  if (!at) return res.status(404).json({ error: 'not found' })
  if (at.status !== 'submitted' && at.status !== 'expired') {
    return res.status(409).json({ error: 'not submitted' })
  }
  const { rows: problems } = await pool.query(
    `select id, ordinal, type, stem, choices, correct, answers, explanation, figures
       from problems where set_id = $1 order by ordinal`,
    [at.set_id],
  )
  const { rows: responses } = await pool.query(
    `select problem_id, answer, is_correct, marked_for_review, time_spent_ms
       from responses where attempt_id = $1`,
    [at.id],
  )
  res.json({
    studentName: at.student_name,
    assignmentTitle: at.assignment_title,
    status: at.status,
    score: responses.filter((r) => r.is_correct).length,
    total: problems.length,
    problems,
    responses,
  })
})
