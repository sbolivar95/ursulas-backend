import pkg from 'pg'
import { config } from '../config/env.js'

const { Pool } = pkg

const isProduction = process.env.NODE_ENV === 'production'

export const pool = new Pool({
  connectionString: config.dbUrl || process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
})

pool.on('connect', async (client) => {
  try {
    const info = await client.query(`
      SELECT current_database(), current_schema(), current_user;
    `)
    const sp = await client.query(`SHOW search_path;`)
    console.log('DB CONNECT INFO:', info.rows[0], 'SEARCH_PATH:', sp.rows[0])
  } catch (e) {
    console.error('Error checking DB info on connect:', e)
  }
})

// Helper for querying
export async function query(text, params) {
  const res = await pool.query(text, params)
  return res
}
