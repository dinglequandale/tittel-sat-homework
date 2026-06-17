import { Router } from 'express'
import { pool } from '../db.ts'
import { newToken } from '../tokens.ts'
import { buildLessonReview } from '../lessonExport.ts'
import { ingestProblemSet, IngestError } from '../ingest.ts'
import type { ProblemSet } from '../../shared/format.ts'

// All routes are gated by the shared TUTOR_SECRET embedded in the URL.
export const tutorRouter = Router({ mergeParams: true })

tutorRouter.use((req, res, next) => {
  const expected = process.env.TUTOR_SECRET
  if (!expected || (req.params as { secret?: string }).secret !== expected) {
    return res.status(403).json({ error: 'forbidden' })
  }
  next()
})

// --- Overview ---------------------------------------------------------------
tutorRouter.get('/overview', async (_req, res) => {
  const [sets, students, assignments, groups] = await Promise.all([
    pool.query(
      `select ps.id, ps.title, ps.updated_at,
              (select count(*) from problems p where p.set_id = ps.id) as problems
         from problem_sets ps order by ps.updated_at desc`,
    ),
    pool.query(`select id, name, token from students order by name`),
    pool.query(
      `select asg.id, asg.title, asg.set_id, asg.time_limit_sec, asg.created_at,
              (select count(*) from assignment_students x where x.assignment_id = asg.id) as assigned,
              (select count(*) from attempts a where a.assignment_id = asg.id
                 and a.status in ('submitted','expired')) as submitted
         from assignments asg order by asg.created_at desc`,
    ),
    pool.query(
      `select g.id, g.name,
              coalesce(
                json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name)
                  filter (where s.id is not null),
                '[]'
              ) as members
         from groups g
         left join group_members gm on gm.group_id = g.id
         left join students s on s.id = gm.student_id
        group by g.id
        order by g.name`,
    ),
  ])
  res.json({
    sets: sets.rows,
    students: students.rows,
    assignments: assignments.rows,
    groups: groups.rows,
  })
})

// --- Sets -------------------------------------------------------------------
tutorRouter.get('/sets/:setId/problems', async (req, res) => {
  const { rows } = await pool.query(
    `select id, ordinal, type, stem from problems where set_id = $1 order by ordinal`,
    [req.params.setId],
  )
  res.json({ problems: rows })
})

// Upload a problem-set JSON from the dashboard: validate, render figures
// (server-side TikZ -> SVG), and upsert. Same path as the `npm run push` CLI.
tutorRouter.post('/problem-sets', async (req, res) => {
  const set = req.body
  if (!set || typeof set !== 'object') {
    return res.status(400).json({ error: 'Send the problem-set JSON as the request body.' })
  }
  try {
    const result = await ingestProblemSet(set as ProblemSet)
    res.json(result)
  } catch (e) {
    if (e instanceof IngestError) {
      return res.status(400).json({ error: 'Validation failed', errors: e.errors })
    }
    // A figure that fails to compile surfaces here as a generic error.
    return res.status(400).json({ error: (e as Error).message })
  }
})

tutorRouter.delete('/problem-sets/:setId', async (req, res) => {
  // Block deletion if any attempt responses reference this set's problems.
  const { rows } = await pool.query(
    `select 1 from responses r join problems p on p.id = r.problem_id
      where p.set_id = $1 limit 1`,
    [req.params.setId],
  )
  if (rows.length) {
    return res.status(409).json({ error: 'This set has student results — it can’t be deleted.' })
  }
  await pool.query(`delete from problem_sets where id = $1`, [req.params.setId])
  res.json({ ok: true })
})

// --- Students ---------------------------------------------------------------
tutorRouter.post('/students', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name required' })
  const token = newToken()
  const { rows } = await pool.query(
    `insert into students (name, token) values ($1, $2) returning id, name, token`,
    [name, token],
  )
  res.json(rows[0])
})

// Delete a student. Cascades to their group memberships, assignments, attempts
// and responses (all FK'd on delete cascade).
tutorRouter.delete('/students/:id', async (req, res) => {
  await pool.query(`delete from students where id = $1`, [req.params.id])
  res.json({ ok: true })
})

// --- Groups -----------------------------------------------------------------
tutorRouter.post('/groups', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name) return res.status(400).json({ error: 'name required' })
  const { rows } = await pool.query(`insert into groups (name) values ($1) returning id, name`, [name])
  res.json(rows[0])
})

tutorRouter.delete('/groups/:id', async (req, res) => {
  await pool.query(`delete from groups where id = $1`, [req.params.id])
  res.json({ ok: true })
})

// Add one or more students to a group.
tutorRouter.post('/groups/:id/members', async (req, res) => {
  const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds : []
  for (const sid of ids) {
    await pool.query(
      `insert into group_members (group_id, student_id) values ($1, $2) on conflict do nothing`,
      [req.params.id, sid],
    )
  }
  res.json({ ok: true })
})

tutorRouter.delete('/groups/:id/members/:studentId', async (req, res) => {
  await pool.query(`delete from group_members where group_id = $1 and student_id = $2`, [
    req.params.id,
    req.params.studentId,
  ])
  res.json({ ok: true })
})

// --- Assignments ------------------------------------------------------------
tutorRouter.post('/assignments', async (req, res) => {
  const { setId, title, timeLimitSec, studentIds } = req.body ?? {}
  if (typeof setId !== 'string' || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: 'setId and non-empty studentIds required' })
  }
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      `insert into assignments (set_id, title, time_limit_sec) values ($1, $2, $3) returning id`,
      [setId, title ?? null, Math.max(1, Math.floor(Number(timeLimitSec) || 900))],
    )
    const assignmentId = rows[0].id
    const links: Array<{ studentId: string; studentName: string; attemptToken: string }> = []
    for (const sid of studentIds) {
      await client.query(
        `insert into assignment_students (assignment_id, student_id) values ($1, $2)
         on conflict do nothing`,
        [assignmentId, sid],
      )
      await client.query(
        `insert into attempts (assignment_id, student_id, token) values ($1, $2, $3)
         on conflict (assignment_id, student_id) do nothing`,
        [assignmentId, sid, newToken()],
      )
      const { rows: at } = await client.query(
        `select at.token, s.name from attempts at join students s on s.id = at.student_id
          where at.assignment_id = $1 and at.student_id = $2`,
        [assignmentId, sid],
      )
      if (at[0]) links.push({ studentId: sid, studentName: at[0].name, attemptToken: at[0].token })
    }
    await client.query('commit')
    res.json({ assignmentId, links })
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
})

tutorRouter.get('/assignments/:id/analytics', async (req, res) => {
  const id = req.params.id
  const { rows: meta } = await pool.query(
    `select asg.title, asg.set_id, asg.time_limit_sec, ps.title as set_title
       from assignments asg join problem_sets ps on ps.id = asg.set_id where asg.id = $1`,
    [id],
  )
  if (!meta[0]) return res.status(404).json({ error: 'not found' })

  const { rows: problems } = await pool.query(
    `select id, ordinal, type, stem from problems where set_id = $1 order by ordinal`,
    [meta[0].set_id],
  )
  const { rows: attempts } = await pool.query(
    `select a.id, a.status, s.name as student_name
       from attempts a join students s on s.id = a.student_id where a.assignment_id = $1`,
    [id],
  )
  const done = attempts.filter((a) => a.status === 'submitted' || a.status === 'expired')
  const ids = done.map((a) => a.id)

  let responses: Array<{ attempt_id: string; problem_id: string; answer: string | null; is_correct: boolean | null; time_spent_ms: number }> = []
  if (ids.length) {
    const { rows } = await pool.query(
      `select attempt_id, problem_id, answer, is_correct, time_spent_ms
         from responses where attempt_id = any($1::uuid[])`,
      [ids],
    )
    responses = rows
  }

  const perProblem = problems.map((p) => {
    const rs = responses.filter((r) => r.problem_id === p.id)
    const answered = rs.filter((r) => r.answer != null && r.answer !== '').length
    const correct = rs.filter((r) => r.is_correct).length
    const times = rs.map((r) => r.time_spent_ms || 0)
    const avgTimeMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
    return {
      problemId: p.id,
      ordinal: p.ordinal,
      type: p.type,
      stem: p.stem,
      attempts: rs.length,
      answered,
      correct,
      pctCorrect: rs.length ? correct / rs.length : null,
      avgTimeMs,
    }
  })

  const perStudent = done.map((a) => {
    const rs = responses.filter((r) => r.attempt_id === a.id)
    return {
      studentName: a.student_name,
      status: a.status,
      score: rs.filter((r) => r.is_correct).length,
      total: problems.length,
      totalTimeMs: rs.reduce((acc, r) => acc + (r.time_spent_ms || 0), 0),
    }
  })

  res.json({
    title: meta[0].title,
    setTitle: meta[0].set_title,
    setId: meta[0].set_id,
    assigned: attempts.length,
    submitted: done.length,
    perProblem,
    perStudent,
  })
})

// --- Lesson-plan export -----------------------------------------------------
tutorRouter.post('/lesson-export', async (req, res) => {
  const problemIds = Array.isArray(req.body?.problemIds) ? req.body.problemIds : []
  const title = typeof req.body?.title === 'string' ? req.body.title : 'Homework Review'
  if (problemIds.length === 0) return res.status(400).json({ error: 'problemIds required' })

  const { rows } = await pool.query(
    `select id, ordinal, type, stem, choices, figures, explanation
       from problems where id = any($1::text[]) order by ordinal`,
    [problemIds],
  )
  // Preserve the order the tutor selected them in.
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = problemIds.map((id: string) => byId.get(id)).filter(Boolean)

  const doc = buildLessonReview(
    ordered.map((p: { ordinal: number; type: 'mc' | 'grid'; stem: string; choices: unknown; figures: unknown; explanation: string | null }, i: number) => ({
      ordinal: i + 1,
      type: p.type,
      stem: p.stem,
      choices: (p.choices as { id: string; content: string }[]) ?? [],
      figures: normalizeFigures(p.figures),
      explanation: p.explanation,
    })),
    title,
  )
  res.json(doc)
})

// Tolerate both the current array shape and any legacy { figId: svg } rows.
function normalizeFigures(raw: unknown): { id: string; label?: string; svg: string }[] {
  if (Array.isArray(raw)) return raw.filter((f) => f && f.svg)
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, string>).map(([id, svg]) => ({ id, svg }))
  }
  return []
}
