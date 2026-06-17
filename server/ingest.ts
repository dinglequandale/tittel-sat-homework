import { pool } from './db.ts'
import { renderFigures } from './figures.ts'
import { validateSet } from './validate.ts'
import type { ProblemSet, RenderedFigure } from '../shared/format.ts'

// Shared ingestion path for both the CLI (push.ts) and the dashboard upload
// endpoint: validate -> render figures -> upsert. Deterministic problem ids
// (`<setId>:<problemId>`) make re-ingesting the same set idempotent.

export class IngestError extends Error {
  constructor(public errors: string[]) {
    super(errors[0] ?? 'invalid problem set')
    this.name = 'IngestError'
  }
}

// node-tikzjax must not run concurrently — serialize figure rendering across
// all callers (two simultaneous uploads would otherwise corrupt each other).
let renderChain: Promise<unknown> = Promise.resolve()

export interface RenderedSet {
  figsByProblem: Record<string, RenderedFigure[]>
  figCount: number
}

export function renderSet(set: ProblemSet): Promise<RenderedSet> {
  const run = renderChain.then(async (): Promise<RenderedSet> => {
    const figsByProblem: Record<string, RenderedFigure[]> = {}
    let figCount = 0
    for (const p of set.problems) {
      let figs: RenderedFigure[]
      try {
        figs = await renderFigures(p.figures)
      } catch (e) {
        throw new Error(`Problem "${p.id}": ${(e as Error).message}`)
      }
      figsByProblem[p.id] = figs
      figCount += figs.length
    }
    return { figsByProblem, figCount }
  })
  renderChain = run.catch(() => {})
  return run
}

export interface IngestResult {
  setId: string
  title: string
  problems: number
  figures: number
  updated: boolean
}

export async function ingestProblemSet(set: ProblemSet): Promise<IngestResult> {
  const errors = validateSet(set)
  if (errors.length) throw new IngestError(errors)

  const { figsByProblem, figCount } = await renderSet(set)

  const client = await pool.connect()
  try {
    await client.query('begin')
    const existing = await client.query('select 1 from problem_sets where id = $1', [set.id])
    await client.query(
      `insert into problem_sets (id, title, updated_at) values ($1, $2, now())
       on conflict (id) do update set title = excluded.title, updated_at = now()`,
      [set.id, set.title],
    )

    // Drop problems no longer in the file — but never one that already has
    // student responses (would orphan results / violate the FK).
    const incomingIds = set.problems.map((p) => `${set.id}:${p.id}`)
    await client.query(
      `delete from problems p
        where p.set_id = $1
          and not (p.id = any($2::text[]))
          and not exists (select 1 from responses r where r.problem_id = p.id)`,
      [set.id, incomingIds],
    )

    for (let i = 0; i < set.problems.length; i++) {
      const p = set.problems[i]
      await client.query(
        `insert into problems
           (id, set_id, ordinal, type, stem, choices, correct, answers, explanation, figures)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (id) do update set
           ordinal = excluded.ordinal, type = excluded.type, stem = excluded.stem,
           choices = excluded.choices, correct = excluded.correct, answers = excluded.answers,
           explanation = excluded.explanation, figures = excluded.figures`,
        [
          `${set.id}:${p.id}`,
          set.id,
          i,
          p.type,
          p.stem,
          JSON.stringify(p.choices ?? []),
          p.correct ?? null,
          JSON.stringify(p.answers ?? []),
          p.explanation ?? null,
          JSON.stringify(figsByProblem[p.id] ?? []),
        ],
      )
    }
    await client.query('commit')
    return {
      setId: set.id,
      title: set.title,
      problems: set.problems.length,
      figures: figCount,
      updated: (existing.rowCount ?? 0) > 0,
    }
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
