// Applies db/schema.sql to the configured DATABASE_URL. Idempotent.
//   npm run migrate
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool } from './db.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8')

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }
  await pool.query(schema)
  console.log('✓ Schema applied.')
  await pool.end()
}

run().catch((err) => {
  console.error('✗ Migration failed:', err.message)
  process.exit(1)
})
