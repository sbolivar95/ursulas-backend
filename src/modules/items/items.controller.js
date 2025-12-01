import { pool } from '../../db/pool.js'

export async function createItem(req, res, next) {
  try {
    const orgId = req.params.orgId // UUID or INT
    const {
      name,
      sku,
      purchase_unit_id,
      purchase_qty,
      purchase_cost,
      base_unit_id,
      base_qty_per_purchase,
      active = true,
    } = req.body

    if (
      !name ||
      !purchase_unit_id ||
      !purchase_qty ||
      !purchase_cost ||
      !base_unit_id ||
      !base_qty_per_purchase
    ) {
      return res.status(400).json({ message: 'Missing required fields' })
    }

    const { rows } = await pool.query(
      `
      INSERT INTO items (
        org_id,
        name,
        sku,
        purchase_unit_id,
        purchase_qty,
        purchase_cost,
        base_unit_id,
        base_qty_per_purchase,
        active,
        cost_per_base_unit
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6::numeric / NULLIF($8::numeric, 0)
      RETURNING *;
      `,
      [
        orgId,
        name,
        sku ?? null,
        purchase_unit_id,
        purchase_qty,
        purchase_cost,
        base_unit_id,
        base_qty_per_purchase,
        active,
      ]
    )

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
}

export async function listItems(req, res, next) {
  try {
    const orgId = req.params.orgId

    const { rows } = await pool.query(
      `
      SELECT 
      i.id, 
      i.name, 
      i.sku, 
      i.purchase_cost, 
      i.active,
      i.cost_per_base_unit, 
      pu.symbol AS purchase_unit, 
      bu.symbol AS base_unit, 
      c.name as category_name 
      FROM Items i 
      INNER JOIN units pu ON i.purchase_unit_id = pu.id
      INNER JOIN units bu ON i.base_unit_id = bu.id
      LEFT JOIN categories c on i.category_id = c.id
      WHERE i.org_id = $1
      `,
      [orgId]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

export async function getItemById(req, res, next) {
  try {
    const orgId = req.params.orgId
    const itemId = req.params.itemId

    const { rows } = await pool.query(
      `
      SELECT *
      FROM items
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, itemId]
    )

    const item = rows[0]
    if (!item) {
      return res
        .status(404)
        .json({ message: 'Item not found in this organization' })
    }

    res.json(item)
  } catch (err) {
    next(err)
  }
}

export async function updateItem(req, res, next) {
  try {
    const orgId = req.params.orgId
    const itemId = req.params.itemId

    const allowedFields = [
      'name',
      'sku',
      'purchase_unit_id',
      'purchase_qty',
      'purchase_cost',
      'category_id',
      'base_unit_id',
      'base_qty_per_purchase',
      'active',
    ]

    const updates = []
    const values = []
    let idx = 1

    for (const field of allowedFields) {
      if (field in req.body) {
        updates.push(`${field} = $${idx}`)
        values.push(req.body[field])
        idx += 1
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' })
    }

    values.push(orgId)
    values.push(itemId)

    const { rows } = await pool.query(
      `
      UPDATE items
      SET ${updates.join(', ')}, updated_at = now()
      WHERE org_id = $${idx} AND id = $${idx + 1}
      RETURNING *;
      `,
      values
    )

    await pool.query(
      `
      UPDATE items
      SET cost_per_base_unit = purchase_cost::numeric / NULLIF(base_qty_per_purchase::numeric, 0)
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, itemId]
    )

    const item = rows[0]
    if (!item) {
      return res
        .status(404)
        .json({ message: 'Item not found in this organization' })
    }

    res.json(item)
  } catch (err) {
    next(err)
  }
}

export async function deleteItem(req, res, next) {
  try {
    const orgId = req.params.orgId
    const itemId = req.params.itemId

    const { rowCount } = await pool.query(
      `
      DELETE FROM items
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, itemId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Item not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function returnUnits(req, res, next) {
  try {
    const result = await pool.query(
      `
      SELECT * FROM units
      `
    )

    if (!result) {
      return res.status(404).json({ message: 'No units found' })
    }

    res.status(200).send(result.rows)
  } catch (err) {
    next(err)
  }
}

export async function returnCategories(req, res, next) {
  try {
    const orgId = req.params.orgId
    const result = await pool.query(
      `
      SELECT * FROM categories
      WHERE org_id = $1
      `,
      [orgId]
    )

    if (!result) {
      return res.status(404).json({ message: 'No units found' })
    }

    res.status(200).send(result.rows)
  } catch (err) {
    next(err)
  }
}
