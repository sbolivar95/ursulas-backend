import express from 'express'
import cors from 'cors'
import { config } from './config/env.js'

// Routers
import { authRouter } from './modules/auth/auth.routes.js'
import { itemsRouter } from './modules/items/items.routes.js'
import { productsRouter } from './modules/products/products.routes.js'
import { recipesRouter } from './modules/recipes/recipes.routes.js'

const app = express()

const allowedOrigins = [
  'http://localhost:3000',
  'https://shefa-lechem.vercel.app/', // 👈 replace with your real domain
]

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Routes
app.use('/auth', authRouter)
app.use('/items', itemsRouter)
app.use('/products', productsRouter)
app.use('/recipes', recipesRouter)

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
