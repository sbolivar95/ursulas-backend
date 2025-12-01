import pkg from 'pg'
import { config } from '../config/env.js'

const { Pool } = pkg

const isProduction = process.env.NODE_ENV === 'production'

export const pool = new Pool({
  connectionString: config.dbUrl || process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
})

// Helper for querying
export async function query(text, params) {
  const res = await pool.query(text, params)
  return res
}
