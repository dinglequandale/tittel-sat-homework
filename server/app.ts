import 'express-async-errors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { pool } from './db.ts'
import { attemptRouter } from './routes/attempt.ts'
import { portalRouter } from './routes/portal.ts'
import { tutorRouter } from './routes/tutor.ts'

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

// Feature routers. Async errors are funneled to one JSON error handler below.
app.use('/api/attempt', attemptRouter)
app.use('/api/portal', portalRouter)
app.use('/api/tutor/:secret', tutorRouter)

// Any unmatched /api route is a 404 (not the SPA fallback HTML).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }))

// Central error handler so a thrown/rejected route returns JSON, not an HTML 500.
app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api error]', err)
  res.status(500).json({ error: (err as Error)?.message ?? 'internal error' })
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
