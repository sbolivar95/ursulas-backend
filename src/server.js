import express from 'express'
import cors from 'cors'
import { config } from './config/env.js'
import { pool } from './db/pool.js'

// Routers
import { authRouter } from './modules/auth/auth.routes.js'
import { itemsRouter } from './modules/items/items.routes.js'
import { productsRouter } from './modules/products/products.routes.js'
import { recipesRouter } from './modules/recipes/recipes.routes.js'
import { employeesRouter } from './modules/employees/employees.routes.js'

const app = express()

const allowedOrigins = [
  'http://localhost:3000',
  'https://shefa-lechem.vercel.app',
]

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)
app.use(express.json())

// Health check
app.get('/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()')
    res.json({
      ok: true,
      time: result.rows[0].now,
    })
  } catch (err) {
    console.error('DB health error:', err)
    res.status(500).json({
      ok: false,
      error: err.message,
    })
  }
})

app.get('/debug/db', async (req, res) => {
  try {
    const dbInfo = await pool.query(`
      SELECT current_database(), current_schema(), current_user;
    `)

    const searchPath = await pool.query(`SHOW search_path;`)

    const usersTable = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = 'users';
    `)

    res.json({
      dbInfo: dbInfo.rows[0],
      searchPath: searchPath.rows[0],
      usersTable: usersTable.rows,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

// Routes
app.use('/auth', authRouter)
app.use('/items', itemsRouter)
app.use('/products', productsRouter)
app.use('/recipes', recipesRouter)
app.use('/employees', employeesRouter)

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  res
    .status(err.status || 500)
    .json({ message: err.message || 'Internal server error' })
})

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`)
})
