import { pool } from '../../db/pool.js'

// ---- recipes ----

export async function createRecipe(req, res, next) {
  const client = await pool.connect()

  try {
    const { orgId, userCode } = req.params
    const {
      name,
      description,
      yield_qty_g,
      total_recipe_cost,
      recipe_cost_per_gram,
      items,
    } = req.body

    await client.query('BEGIN')

    if (!orgId || !userCode) {
      return res
        .status(400)
        .json({ message: 'Organization and User is required' })
    }

    // 1) Insert recipe and get its id
    const recipeResult = await client.query(
      `
      INSERT INTO recipes (
        org_id,
        name,
        description,
        yield_qty_g,
        total_recipe_cost,
        recipe_cost_per_gram,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
      `,
      [
        orgId,
        name,
        description ?? '',
        yield_qty_g,
        total_recipe_cost,
        recipe_cost_per_gram,
        userCode,
      ]
    )

    const recipeId = recipeResult.rows[0].id

    await client.query(
      `
      INSERT INTO recipe_items (recipe_id, item_id, qty_g, waste_pct)
      SELECT
        $1,
        x.item_id,
        x.qty_g,
        x.waste_pct
      FROM jsonb_to_recordset($2::jsonb)
        AS x(item_id uuid, qty_g numeric, waste_pct numeric);
      `,
      [recipeId, JSON.stringify(items)]
    )

    await client.query('COMMIT')

    res.status(201).json({ message: 'Recipe created', recipeId })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

export async function listRecipes(req, res, next) {
  try {
    const orgId = req.params.orgId

    const { rows } = await pool.query(
      `
      SELECT
        r.id,
        r.name,
        r.description,
        r.yield_qty_g,
        r.created_at,
        r.updated_at,
        SUM(ri.qty_g * i.cost_per_base_unit) as total_recipe_cost,
        SUM(ri.qty_g * i.cost_per_base_unit) / r.yield_qty_g as recipe_cost_per_gram,
        uc.full_name as created_by,
        ub.full_name as updated_by,
        COALESCE(
          json_agg(
            json_build_object(
              'item_id', ri.item_id,
              'qty_g', ri.qty_g,
              'recipe_id', ri.recipe_id,
              'waste_pct', ri.waste_pct,
              'name', i."name",
              'cost_per_base_unit', i.cost_per_base_unit
            )
          ) FILTER (WHERE ri.item_id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM recipes r
      INNER JOIN recipe_items ri ON r.id = ri.recipe_id
      INNER JOIN items i ON ri.item_id = i.id
      LEFT JOIN users uc ON r.created_by = uc.id
      LEFT JOIN users ub ON r.updated_by = ub.id
      WHERE r.org_id = $1
      GROUP BY
        r.id,
        r.name,
        r.description,
        r.yield_qty_g,
        r.created_by,
        r.created_at,
        r.updated_at,
        uc.full_name,
        ub.full_name
      ORDER BY r.name DESC;
      `,
      [orgId]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

export async function getRecipeById(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId

    const { rows } = await pool.query(
      `
      SELECT *
      FROM recipes
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, recipeId]
    )

    const recipe = rows[0]
    if (!recipe) {
      return res
        .status(404)
        .json({ message: 'Recipe not found in this organization' })
    }

    res.json(recipe)
  } catch (err) {
    next(err)
  }
}

export async function updateRecipe(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId
    const userCode = req.params.userCode

    const { total_recipe_cost, recipe_cost_per_gram } = req.body

    const allowedFields = ['name', 'description', 'yield_qty_g']

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
    values.push(recipeId)
    values.push(userCode)

    const { rows } = await pool.query(
      `
      UPDATE recipes
      SET ${updates.join(', ')}, updated_at = now(), updated_by = $${idx + 2}
      WHERE org_id = $${idx} AND id = $${idx + 1}
      RETURNING *;
      `,
      values
    )

    await pool.query(
      `
      UPDATE recipes
      SET total_recipe_cost = $1, recipe_cost_per_gram = $2
      WHERE org_id = $3 AND id = $4;
      `,
      [Number(total_recipe_cost), Number(recipe_cost_per_gram), orgId, recipeId]
    )

    const recipe = rows[0]
    if (!recipe) {
      return res
        .status(404)
        .json({ message: 'Recipe not found in this organization' })
    }

    res.json(recipe)
  } catch (err) {
    next(err)
  }
}

export async function deleteRecipe(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId

    const { rowCount } = await pool.query(
      `
      DELETE FROM recipes
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, recipeId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Recipe not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ---- recipe_items ----

export async function listRecipeItems(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId

    const { rows } = await pool.query(
      `
      SELECT ri.recipe_id,
             ri.item_id,
             ri.qty_g,
             ri.waste_pct,
             i.name AS item_name,
             i.cost_per_base_unit
      FROM recipe_items ri
      JOIN recipes r ON r.id = ri.recipe_id
      JOIN items   i ON i.id = ri.item_id
      WHERE r.org_id = $1
        AND ri.recipe_id = $2
      ORDER BY i.name;
      `,
      [orgId, recipeId]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

export async function upsertRecipeItem(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId
    const itemId = req.params.itemId
    const { qty_g, waste_pct = 0 } = req.body

    if (!qty_g) {
      return res.status(400).json({ message: 'qty_g is required' })
    }

    // Optional: validate recipe belongs to org
    const recipeCheck = await pool.query(
      `SELECT 1 FROM recipes WHERE org_id = $1 AND id = $2;`,
      [orgId, recipeId]
    )
    if (recipeCheck.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Recipe not found in this organization' })
    }

    const { rows } = await pool.query(
      `
      INSERT INTO recipe_items (recipe_id, item_id, qty_g, waste_pct)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (recipe_id, item_id)
      DO UPDATE SET
        qty_g = EXCLUDED.qty_g,
        waste_pct = EXCLUDED.waste_pct
      RETURNING *;
      `,
      [recipeId, itemId, qty_g, waste_pct]
    )

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

export async function deleteRecipeItem(req, res, next) {
  try {
    const orgId = req.params.orgId
    const recipeId = req.params.recipeId
    const itemId = req.params.itemId

    const { rowCount } = await pool.query(
      `
      DELETE FROM recipe_items
      USING recipes
      WHERE recipe_items.recipe_id = recipes.id
        AND recipes.org_id = $1
        AND recipe_items.recipe_id = $2
        AND recipe_items.item_id = $3;
      `,
      [orgId, recipeId, itemId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Recipe item not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
