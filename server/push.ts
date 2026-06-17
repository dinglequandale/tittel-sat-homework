// Authoring CLI: push a problem-set JSON into the database.
//   npm run push examples/set.example.json            (validate + render + write)
//   npm run push examples/set.example.json --dry-run   (validate + render only)
//
// Idempotent: re-pushing the same set id upserts the set and its problems in
// place (deterministic ids "<setId>:<problemId>"), preserving FK references
// from any existing attempt responses.
import './env.ts'
import fs from 'node:fs'
import path from 'node:path'
import { pool } from './db.ts'
import { renderFigures } from './figures.ts'
import { validateSet } from './validate.ts'
import type { ProblemSet } from '../shared/format.ts'

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) fail('Usage: npm run push <set.json> [--dry-run]')

  const raw = fs.readFileSync(path.resolve(file!), 'utf8')
  let set: ProblemSet
  try {
    set = JSON.parse(raw)
  } catch (e) {
    return fail(`Invalid JSON: ${(e as Error).message}`)
  }

  const errors = validateSet(set)
  if (errors.length) {
    console.error(`✗ Validation failed (${errors.length}):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  // Render figures up front (serial — node-tikzjax can't run concurrently).
  console.log(`Rendering figures for "${set.title}" — ${set.problems.length} problem(s)…`)
  const figsByProblem: Record<string, Record<string, string>> = {}
  let figCount = 0
  for (const p of set.problems) {
    try {
      const map = await renderFigures(p.figures)
      figsByProblem[p.id] = map
      figCount += Object.keys(map).length
    } catch (e) {
      return fail(`Figure render failed in problem "${p.id}": ${(e as Error).message}`)
    }
  }
  console.log(`  ${figCount} figure(s) rendered.`)

  if (dryRun) {
    console.log('Dry run — nothing written. Would upsert:')
    set.problems.forEach((p, i) =>
      console.log(`  ${i + 1}. [${p.type}] ${set.id}:${p.id}  figures=${Object.keys(figsByProblem[p.id]).length}`),
    )
    await pool.end()
    return
  }

  if (!process.env.DATABASE_URL) {
    return fail('DATABASE_URL not set — cannot write. Use --dry-run to validate + render without a DB.')
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into problem_sets (id, title, updated_at) values ($1, $2, now())
       on conflict (id) do update set title = excluded.title, updated_at = now()`,
      [set.id, set.title],
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
          JSON.stringify(figsByProblem[p.id] ?? {}),
        ],
      )
    }
    await client.query('commit')
    console.log(`✓ Pushed "${set.title}" (${set.id}) — ${set.problems.length} problems, ${figCount} figures.`)
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

main().catch((e) => fail((e as Error).message))
