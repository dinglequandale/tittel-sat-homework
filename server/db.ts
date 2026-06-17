import './env.ts'
import { Pool } from 'pg'

// Single shared connection pool. DATABASE_URL is the Supabase Postgres URI.
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.warn(
    '[db] DATABASE_URL is not set — DB queries will fail until you configure it (see .env.example).',
  )
}

// Supabase requires TLS; local Postgres typically does not.
const isLocal =
  !!connectionString &&
  (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : undefined,
})
