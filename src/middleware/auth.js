import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || ''

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.user = {
      id: payload.userId,
      activeOrgId: payload.activeOrgId,
      role: payload.orgRole,
    }
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' })
    }
    next()
  }
}

export function requireOrgMatchFromParam(paramName = 'orgId') {
  return (req, res, next) => {
    const orgId = Number(req.params[paramName])

    if (Number.isNaN(orgId)) {
      return res.status(400).json({ message: 'Invalid org id in URL' })
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const activeOrgId = Number(req.user.activeOrgId)

    if (Number.isNaN(activeOrgId)) {
      return res
        .status(400)
        .json({ message: 'No valid active organization in token' })
    }

    // Now both are numbers
    if (orgId !== activeOrgId) {
      return res
        .status(403)
        .json({ message: 'You do not have access to this organization' })
    }

    next()
  }
}
