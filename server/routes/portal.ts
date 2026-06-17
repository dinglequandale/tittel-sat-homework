import { Router } from 'express'
import { pool } from '../db.ts'

export const portalRouter = Router()

// The student's home: their name + every assignment with attempt status and,
// once submitted, their score. The attempt_token deep-links into the runner.
portalRouter.get('/:token', async (req, res) => {
  const { rows: students } = await pool.query(
    `select id, name from students where token = $1`,
    [req.params.token],
  )
  const student = students[0]
  if (!student) return res.status(404).json({ error: 'not found' })

  const { rows: assignments } = await pool.query(
    `select asg.id            as assignment_id,
            asg.title,
            asg.time_limit_sec,
            asg.created_at,
            ps.title           as set_title,
            at.token           as attempt_token,
            coalesce(at.status, 'not_started') as status,
            (select count(*) from problems p where p.set_id = asg.set_id) as total,
            (select count(*) from responses r
               where r.attempt_id = at.id and r.is_correct) as score
       from assignment_students asched
       join assignments asg on asg.id = asched.assignment_id
       join problem_sets ps on ps.id = asg.set_id
       left join attempts at
              on at.assignment_id = asg.id and at.student_id = asched.student_id
      where asched.student_id = $1
      order by asg.created_at desc`,
    [student.id],
  )

  res.json({ studentName: student.name, assignments })
})
