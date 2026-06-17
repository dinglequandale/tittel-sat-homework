import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { pool } from './db.ts'

// The configured Express app — defined separately from the listen() bootstrap
// (server/index.ts) so it can also be imported by a serverless handler if we
// ever move the web tier to Vercel. All state lives in Postgres; nothing here
// holds in-memory state.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../client/dist')

export const app = express()
app.use(express.json({ limit: '2mb' }))

// ---------------------------------------------------------------------------
// API. Real routes land in later milestones; /api/health proves the DB wiring.
// ---------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('select now() as now')
    res.json({ ok: true, db: true, now: rows[0].now })
  } catch (err) {
    res.status(200).json({ ok: true, db: false, error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------
// Static client + SPA fallback (production build only; in dev Vite serves it).
// ---------------------------------------------------------------------------
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}
