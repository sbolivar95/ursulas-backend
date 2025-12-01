import { Router } from 'express'
import {
  registerOwner,
  login,
  me,
  loadUserOrganizations,
} from './auth.controller.js'
import { authenticate } from '../../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/register-owner', registerOwner)
authRouter.post('/login', login)
authRouter.get('/me', authenticate, me)
authRouter.get('/orgs', authenticate, loadUserOrganizations)
