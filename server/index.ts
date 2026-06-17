import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { pool } from './db.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 5959
const clientDist = path.resolve(__dirname, '../client/dist')

const app = express()
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

app.listen(PORT, () => {
  console.log(`SAT homework server listening on http://localhost:${PORT}`)
})
