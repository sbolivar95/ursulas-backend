import pkg from 'pg'
import { config } from '../config/env.js'

const { Pool } = pkg

export const pool = new Pool({
  connectionString: config.dbUrl,
})

// Helper for querying
export async function query(text, params) {
  const res = await pool.query(text, params)
  return res
}
