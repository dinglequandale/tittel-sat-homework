// Authoring CLI: push a problem-set JSON into the database.
//   npm run push examples/set.example.json            (validate + render + write)
//   npm run push examples/set.example.json --dry-run   (validate + render only)
//
// Shares its validate -> render -> upsert path with the dashboard upload
// endpoint (server/ingest.ts). Idempotent: re-pushing the same set id upserts
// in place (deterministic ids "<setId>:<problemId>").
import './env.ts'
import fs from 'node:fs'
import path from 'node:path'
import { pool } from './db.ts'
import { validateSet } from './validate.ts'
import { renderSet, ingestProblemSet, IngestError } from './ingest.ts'
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

  if (dryRun) {
    console.log(`Rendering figures for "${set.title}" — ${set.problems.length} problem(s)…`)
    const { figsByProblem, figCount } = await renderSet(set)
    console.log(`  ${figCount} figure(s) rendered. Dry run — nothing written:`)
    set.problems.forEach((p, i) =>
      console.log(`  ${i + 1}. [${p.type}] ${set.id}:${p.id}  figures=${figsByProblem[p.id].length}`),
    )
    await pool.end()
    return
  }

  if (!process.env.DATABASE_URL) {
    return fail('DATABASE_URL not set — cannot write. Use --dry-run to validate + render without a DB.')
  }

  try {
    console.log(`Rendering figures + writing "${set.title}"…`)
    const r = await ingestProblemSet(set)
    console.log(`✓ ${r.updated ? 'Updated' : 'Created'} "${r.title}" (${r.setId}) — ${r.problems} problems, ${r.figures} figures.`)
  } catch (e) {
    if (e instanceof IngestError) return fail(`Validation failed: ${e.errors.join('; ')}`)
    throw e
  } finally {
    await pool.end()
  }
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

main().catch((e) => fail((e as Error).message))
