import { pool } from '../../db/pool.js'
import bcrypt from 'bcryptjs'
import { config } from '../../config/env.js'

export async function createEmployee(req, res, next) {
  const client = await pool.connect()

  try {
    const orgId = req.params.orgId

    const { email, password_hash, full_name, role } = req.body

    if (!orgId) {
      return res
        .status(400)
        .json({ message: 'Organization and User is required' })
    }

    await client.query('BEGIN')

    const hashed = await bcrypt.hash(password_hash, config.bcryptRounds)
    const userResult = await client.query(
      `
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        RETURNING id, email;
      `,
      [email, hashed, full_name]
    )

    const user = userResult.rows[0]

    await client.query(
      `
        INSERT INTO organization_members (user_id, org_id, role)
        VALUES ($1, $2, $3)
        RETURNING id, role;
      `,
      [user.id, orgId, role]
    )

    await client.query('COMMIT')

    return res.status(204).send()
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

export async function listEmployees(req, res, next) {
  const client = await pool.connect()

  try {
    const orgId = req.params.orgId

    if (!orgId) {
      return res.status(400).json({ message: 'Organization is required' })
    }

    const { rows } = await client.query(
      `
        SELECT om.id, u.email, u.full_name, om.role
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.org_id = $1;
      `,
      [orgId]
    )

    return res.status(200).json(rows)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
}

export async function getEmployeeById(req, res, next) {
  const client = await pool.connect()

  try {
    const orgId = req.params.orgId
    const memberId = req.params.memberId
    if (!orgId || !memberId) {
      return res
        .status(400)
        .json({ message: 'Organization and Member are required' })
    }
    const memberResult = await client.query(
      `
        SELECT om.id, u.email, u.full_name, om.role
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.org_id = $1 AND om.id = $2;
      `,
      [orgId, memberId]
    )
    if (memberResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Member not found in this organization' })
    }
    return res.status(200).json(memberResult.rows[0])
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
}

export async function updateEmployee(req, res, next) {
  const client = await pool.connect()

  try {
    const orgId = req.params.orgId
    const memberId = req.params.memberId
    const { role } = req.body

    if (!orgId || !memberId) {
      return res
        .status(400)
        .json({ message: 'Organization and Member are required' })
    }

    const updateResult = await client.query(
      `
        UPDATE organization_members
        SET role = $1
        WHERE org_id = $2 AND id = $3
        RETURNING id, role;
      `,
      [role, orgId, memberId]
    )

    if (updateResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Member not found in this organization' })
    }

    return res.status(200).json(updateResult.rows[0])
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
}

export async function deleteEmployee(req, res, next) {
  const client = await pool.connect()
  try {
    const orgId = req.params.orgId
    const memberId = req.params.memberId

    if (!orgId || !memberId) {
      return res
        .status(400)
        .json({ message: 'Organization and Member are required' })
    }

    await client.query('BEGIN')

    const deleteResult = await client.query(
      `
        DELETE FROM organization_members
        WHERE org_id = $1 AND id = $2
        RETURNING id;
      `,
      [orgId, memberId]
    )
    if (deleteResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return res
        .status(404)
        .json({ message: 'Member not found in this organization' })
    }

    await client.query('COMMIT')
    return res.status(204).send()
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
}
