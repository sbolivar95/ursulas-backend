import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../../db/pool.js'
import { config } from '../../config/env.js'

function signToken({ userId, activeOrgId, orgRole }) {
  return jwt.sign({ userId, activeOrgId, orgRole }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })
}

// POST /auth/register-owner
export async function registerOwner(req, res, next) {
  const client = await pool.connect()
  try {
    const { email, password, fullName, organizationName } = req.body

    if (!email || !password || !fullName || !organizationName) {
      return res.status(400).json({
        message: 'email, password, full name, organizationName are required',
      })
    }

    await client.query('BEGIN')

    // 1. Create user
    const hashed = await bcrypt.hash(password, config.bcryptRounds)
    const userResult = await client.query(
      `
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        RETURNING id, email;
      `,
      [email, hashed, fullName]
    )
    const user = userResult.rows[0]

    // 2. Create organization
    const orgResult = await client.query(
      `
        INSERT INTO organizations (org_name)
        VALUES ($1)
        RETURNING id, org_name;
      `,
      [organizationName]
    )
    const org = orgResult.rows[0]

    // 3. Create organization_member as OWNER
    const memberResult = await client.query(
      `
        INSERT INTO organization_members (user_id, org_id, role)
        VALUES ($1, $2, 'OWNER')
        RETURNING id, role;
      `,
      [user.id, org.id]
    )
    const member = memberResult.rows[0]

    await client.query('COMMIT')

    const token = signToken({
      userId: user.id,
      activeOrgId: org.id,
      orgRole: member.role,
    })

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
      organization: { id: org.id, name: org.name },
      role: member.role,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

// POST /auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password required' })
    }

    const userResult = await pool.query(
      `
        SELECT id, email, full_name, password_hash
        FROM users
        WHERE email = $1;
      `,
      [email]
    )

    if (userResult.rowCount === 0) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const user = userResult.rows[0]

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // For now: load first membership as active
    const memberResult = await pool.query(
      `
        SELECT org_id, role
        FROM organization_members
        WHERE user_id = $1
        ORDER BY id
        LIMIT 1;
      `,
      [user.id]
    )

    if (memberResult.rowCount === 0) {
      return res
        .status(400)
        .json({ message: 'User has no organization memberships' })
    }

    const membership = memberResult.rows[0]

    const token = signToken({
      userId: user.id,
      activeOrgId: membership.org_id,
      orgRole: membership.role,
    })

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        roles: [membership.role],
      },
      activeOrgId: { id: membership.org_id },
      role: membership.role,
    })
  } catch (err) {
    next(err)
  }
}

export async function loadUserOrganizations(req, res, next) {
  try {
    const userId = req.query.userId

    if (!userId) {
      return res
        .status(400)
        .json({ message: 'user identification is required' })
    }

    const result = await pool.query(
      `
        SELECT
          o.*,
          m.id AS member_id,
          m.role
        FROM organization_members AS m
        INNER JOIN organizations AS o
          ON o.id = m.org_id
        WHERE m.user_id = $1
        ORDER BY o.org_name;
      `,
      [userId]
    )

    res.status(201).json(result.rows)
  } catch (err) {
    next(err)
  }
}

// GET /auth/me
export async function me(req, res, next) {
  try {
    const { id: userId, activeOrgId, role } = req.user

    const userResult = await pool.query(
      `SELECT id, email, full_name FROM users WHERE id = $1;`,
      [userId]
    )

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    const user = userResult.rows[0]

    const orgResult = await pool.query(
      `SELECT id, org_name FROM organizations WHERE id = $1;`,
      [activeOrgId]
    )
    const org = orgResult.rows[0] || null

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      activeOrgId: org,
      role,
    })
  } catch (err) {
    next(err)
  }
}
