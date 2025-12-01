import { pool } from '../../db/pool.js'

// ---- finished_products ----

export async function createProduct(req, res, next) {
  const client = await pool.connect()

  try {
    const { orgId, userCode } = req.params
    const { name, description, recipes, items } = req.body

    await client.query('BEGIN')

    if (!orgId || !userCode) {
      return res
        .status(400)
        .json({ message: 'Organization and User is required' })
    }

    if (!name) {
      return res.status(400).json({ message: 'Name is required' })
    }

    await client.query('BEGIN')

    const productResult = await client.query(
      `
      INSERT INTO finished_products (
        org_id,
        name,
        description,
        created_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id;
      `,
      [orgId, name, description ?? '', userCode]
    )

    const productId = productResult.rows[0].id

    if (Array.isArray(recipes) && recipes.length > 0) {
      await client.query(
        `
        INSERT INTO finished_product_recipes (finished_product_id, recipe_id, qty_g)
        SELECT
          $1,
          x.recipe_id,
          x.qty_g
        FROM jsonb_to_recordset($2::jsonb)
          AS x(recipe_id uuid, qty_g numeric);
        `,
        [productId, JSON.stringify(recipes)]
      )
    }

    if (Array.isArray(items) && items.length > 0) {
      await client.query(
        `
        INSERT INTO finished_product_items (finished_product_id, item_id, qty_g)
        SELECT
          $1,
          x.item_id,
          x.qty_g
        FROM jsonb_to_recordset($2::jsonb)
          AS x(item_id uuid, qty_g numeric);
        `,
        [productId, JSON.stringify(items)]
      )
    }

    await client.query('COMMIT')

    res.status(201).json({ message: 'Product created', productId })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
}

export async function listProducts(req, res, next) {
  try {
    const orgId = req.params.orgId

    const { rows } = await pool.query(
      `
      WITH recipe_costs AS (
        -- cost & cost-per-gram for each recipe in this org
        SELECT
          r.id AS recipe_id,
          r.org_id,
          SUM(ri.qty_g * i.cost_per_base_unit) AS total_recipe_cost,
          SUM(ri.qty_g * i.cost_per_base_unit) / NULLIF(r.yield_qty_g, 0) AS recipe_cost_per_g
        FROM recipes r
        JOIN recipe_items ri ON ri.recipe_id = r.id
        JOIN items i ON i.id = ri.item_id AND i.org_id = r.org_id
        WHERE r.org_id = $1
        GROUP BY r.id, r.org_id, r.yield_qty_g
      ),
      finished_from_items AS (
        -- cost of items directly on the finished product
        SELECT
          fpi.finished_product_id,
          SUM(fpi.qty_g * i.cost_per_base_unit) AS cost_from_items
        FROM finished_product_items fpi
        JOIN items i ON i.id = fpi.item_id
        GROUP BY fpi.finished_product_id
      ),
      finished_from_recipes AS (
        -- cost of recipes (by grams) on the finished product
        SELECT
          fpr.finished_product_id,
          SUM(fpr.qty_g * rc.recipe_cost_per_g) AS cost_from_recipes
        FROM finished_product_recipes fpr
        JOIN recipe_costs rc ON rc.recipe_id = fpr.recipe_id
        GROUP BY fpr.finished_product_id
      ),
      total_costs AS (
        -- total cost per finished product
        SELECT
          fp.id,
          COALESCE(ffi.cost_from_items, 0) + COALESCE(ffr.cost_from_recipes, 0) AS total_finished_product_cost
        FROM finished_products fp
        LEFT JOIN finished_from_items   ffi ON ffi.finished_product_id = fp.id
        LEFT JOIN finished_from_recipes ffr ON ffr.finished_product_id = fp.id
      )
      SELECT
        f.id,
        f.name,
        f.created_at,
        f.updated_at,
        f.description,
        uc.full_name AS created_by,
        ub.full_name AS updated_by,
        COALESCE(tc.total_finished_product_cost, 0) AS total_finished_product_cost,
        COALESCE(recipes.recipes, '[]'::json) AS recipes,
        COALESCE(items.items,   '[]'::json)   AS items
      FROM
        finished_products f
        -- total cost for each finished product
        LEFT JOIN total_costs tc ON tc.id = f.id

        -- build recipes array for each finished product
        LEFT JOIN LATERAL (
          SELECT
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'recipe_id', items_per_recipe.recipe_id,
                'qty_g',     items_per_recipe.qty_g,
                'name',      items_per_recipe.name,
                'items',     items_per_recipe.items
              )
            ) AS recipes
          FROM (
            -- one row per recipe, with its items array
            SELECT
              r.recipe_id,
              r.qty_g,
              rs.name,
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'item_id',   it.id,
                  'item_name', it.name,
                  'qty_g',     rit.qty_g
                )
              ) AS items
            FROM finished_product_recipes r
            JOIN recipes rs      ON rs.id = r.recipe_id
            JOIN recipe_items rit ON rit.recipe_id = r.recipe_id
            JOIN items it        ON rit.item_id = it.id
            WHERE r.finished_product_id = f.id
            GROUP BY r.recipe_id, r.qty_g, rs.name
          ) AS items_per_recipe
        ) recipes ON TRUE

        -- build items array for each finished product
        LEFT JOIN LATERAL (
          SELECT
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'item_id',        i.item_id,
                'qty_g',          i.qty_g,
                'name',           it.name,
                'unit',           un.symbol,
                'price_per_unit', it.cost_per_base_unit
              )
            ) AS items
          FROM finished_product_items i
          JOIN items it ON it.id = i.item_id
          JOIN units un ON it.base_unit_id = un.id
          WHERE i.finished_product_id = f.id
        ) items ON TRUE

        LEFT JOIN users uc ON f.created_by = uc.id
        LEFT JOIN users ub ON f.updated_by = ub.id
      WHERE
        f.org_id = $1
      ORDER BY
        f.name;
      `,
      [orgId]
    )

    res.json(rows)
  } catch (err) {
    next(err)
  }
}

export async function getProductById(req, res, next) {
  try {
    const { orgId, productId } = req.params

    const { rows } = await pool.query(
      `
      WITH recipe_costs AS (
        -- Full cost & cost-per-gram for each recipe in this org
        SELECT
          r.id AS recipe_id,
          r.org_id,
          r.name,
          r.yield_qty_g,
          SUM(ri.qty_g * i.cost_per_base_unit) AS total_recipe_cost,
          SUM(ri.qty_g * i.cost_per_base_unit) / NULLIF(r.yield_qty_g, 0) AS recipe_cost_per_g
        FROM recipes r
        JOIN recipe_items ri ON ri.recipe_id = r.id
        JOIN items i ON i.id = ri.item_id AND i.org_id = r.org_id
        WHERE r.org_id = $1
        GROUP BY r.id, r.org_id, r.name, r.yield_qty_g
      ),
      fp_recipes AS (
        -- Each recipe used in this finished product, with its contribution
        SELECT
          fpr.finished_product_id,
          fpr.recipe_id,
          fpr.qty_g AS qty_g_in_product,
          rc.name,
          rc.yield_qty_g,
          rc.total_recipe_cost,
          rc.recipe_cost_per_g,
          (fpr.qty_g * rc.recipe_cost_per_g) AS cost_for_recipe_in_product
        FROM finished_product_recipes fpr
        JOIN recipe_costs rc
          ON rc.recipe_id = fpr.recipe_id
         AND rc.org_id = $1
        WHERE fpr.finished_product_id = $2
      ),
      fp_recipes_with_items AS (
        -- Add item-level breakdown for each recipe in this product
        SELECT
          fr.finished_product_id,
          fr.recipe_id,
          fr.name,
          fr.qty_g_in_product,
          fr.yield_qty_g,
          fr.total_recipe_cost,
          fr.recipe_cost_per_g,
          fr.cost_for_recipe_in_product,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'item_id',             it.id,
              'item_name',           it.name,
              'qty_g_in_recipe',     rit.qty_g,
              'cost_per_base_unit',  it.cost_per_base_unit,
              'cost_in_full_recipe', rit.qty_g * it.cost_per_base_unit,
              'cost_in_product',
                (rit.qty_g * it.cost_per_base_unit)
                * (fr.qty_g_in_product / NULLIF(fr.yield_qty_g, 0))
            )
          ) AS items
        FROM fp_recipes fr
        JOIN recipe_items rit ON rit.recipe_id = fr.recipe_id
        JOIN items it ON it.id = rit.item_id AND it.org_id = $1
        GROUP BY
          fr.finished_product_id,
          fr.recipe_id,
          fr.name,
          fr.qty_g_in_product,
          fr.yield_qty_g,
          fr.total_recipe_cost,
          fr.recipe_cost_per_g,
          fr.cost_for_recipe_in_product
      ),
      fp_direct_items AS (
        -- Direct items on the finished product (not via recipes)
        SELECT
          fpi.finished_product_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'item_id',                it.id,
              'name',                   it.name,
              'qty_g',                  fpi.qty_g,
              'cost_per_base_unit',     it.cost_per_base_unit,
              'cost_for_item_in_product',
                 fpi.qty_g * it.cost_per_base_unit
            )
          ) AS items,
          SUM(fpi.qty_g * it.cost_per_base_unit) AS cost_from_items
        FROM finished_product_items fpi
        JOIN items it ON it.id = fpi.item_id AND it.org_id = $1
        WHERE fpi.finished_product_id = $2
        GROUP BY fpi.finished_product_id
      ),
      totals AS (
        -- Aggregate totals for this finished product
        SELECT
          fp.id,
          COALESCE(di.cost_from_items, 0) AS total_direct_items_cost,
          COALESCE(
            (SELECT SUM(cost_for_recipe_in_product)
             FROM fp_recipes
             WHERE finished_product_id = fp.id),
            0
          ) AS total_recipes_cost
        FROM finished_products fp
        LEFT JOIN fp_direct_items di ON di.finished_product_id = fp.id
        WHERE fp.org_id = $1
          AND fp.id    = $2
      ),
      recipes_json AS (
        -- Build final JSON array of recipes with nested items
        SELECT
          frwi.finished_product_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'recipe_id',                    frwi.recipe_id,
              'name',                         frwi.name,
              'qty_g_in_product',             frwi.qty_g_in_product,
              'yield_qty_g',                  frwi.yield_qty_g,
              'total_recipe_cost',            frwi.total_recipe_cost,
              'recipe_cost_per_g',            frwi.recipe_cost_per_g,
              'cost_for_recipe_in_product',   frwi.cost_for_recipe_in_product,
              'items',                        frwi.items
            )
          ) AS recipes
        FROM fp_recipes_with_items frwi
        GROUP BY frwi.finished_product_id
      )
      SELECT
        fp.id,
        fp.org_id,
        fp.name,
        fp.description,
        fp.created_at,
        fp.updated_at,
        uc.full_name AS created_by,
        ub.full_name AS updated_by,
        t.total_direct_items_cost,
        t.total_recipes_cost,
        (t.total_direct_items_cost + t.total_recipes_cost) AS total_finished_product_cost,
        COALESCE(rj.recipes, '[]'::json)     AS recipes,
        COALESCE(di.items,   '[]'::json)     AS direct_items
      FROM finished_products fp
      JOIN totals t ON t.id = fp.id
      LEFT JOIN recipes_json   rj ON rj.finished_product_id = fp.id
      LEFT JOIN fp_direct_items di ON di.finished_product_id = fp.id
      LEFT JOIN users uc ON fp.created_by = uc.id
      LEFT JOIN users ub ON fp.updated_by = ub.id
      WHERE fp.org_id = $1
        AND fp.id    = $2;
      `,
      [orgId, productId]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Finished product not found' })
    }

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
}

export async function updateProduct(req, res, next) {
  try {
    const { orgId, userCode, productId } = req.params
    const { recipes, items } = req.body

    const allowedFields = ['name', 'description']

    const updates = []
    const values = []
    let idx = 1

    // Build dynamic UPDATE for finished_products
    for (const field of allowedFields) {
      if (field in req.body) {
        updates.push(`${field} = $${idx}`)
        values.push(req.body[field])
        idx += 1
      }
    }

    // If nothing to update on the product itself AND no recipes/items provided
    if (
      updates.length === 0 &&
      !Array.isArray(recipes) &&
      !Array.isArray(items)
    ) {
      return res.status(400).json({ message: 'No valid fields to update' })
    }

    if (!orgId || !productId) {
      return res
        .status(400)
        .json({ message: 'Organization and Product ID are required' })
    }

    await client.query('BEGIN')

    // Always check that the product exists (and optionally update it)
    let productRow = null

    if (updates.length > 0) {
      // Add orgId and productId to the values list for the WHERE clause
      values.push(orgId)
      values.push(productId)
      values.push(userCode)

      const updateQuery = `
        UPDATE finished_products
        SET ${updates.join(', ')}, updated_at = now(), updated_by = $${idx + 2}
        WHERE org_id = $${idx} AND id = $${idx + 1}
        RETURNING *;
      `

      const { rows } = await client.query(updateQuery, values)
      productRow = rows[0]
    } else {
      // No product fields to update; just verify the row exists
      const { rows } = await client.query(
        `
        SELECT *
        FROM finished_products
        WHERE org_id = $1 AND id = $2;
        `,
        [orgId, productId]
      )
      productRow = rows[0]
    }

    if (!productRow) {
      await client.query('ROLLBACK')
      return res
        .status(404)
        .json({ message: 'Product not found in this organization' })
    }

    // If recipes provided, replace them completely
    if (Array.isArray(recipes)) {
      await client.query(
        `
        DELETE FROM finished_product_recipes
        WHERE finished_product_id = $1;
        `,
        [productId]
      )

      if (recipes.length > 0) {
        await client.query(
          `
          INSERT INTO finished_product_recipes (finished_product_id, recipe_id, qty_g)
          SELECT
            $1,
            x.recipe_id,
            x.qty_g
          FROM jsonb_to_recordset($2::jsonb)
            AS x(recipe_id uuid, qty_g numeric);
          `,
          [productId, JSON.stringify(recipes)]
        )
      }
    }

    // If items provided, replace them completely
    if (Array.isArray(items)) {
      await client.query(
        `
        DELETE FROM finished_product_items
        WHERE finished_product_id = $1;
        `,
        [productId]
      )

      if (items.length > 0) {
        await client.query(
          `
          INSERT INTO finished_product_items (finished_product_id, item_id, qty_g)
          SELECT
            $1,
            x.item_id,
            x.qty_g
          FROM jsonb_to_recordset($2::jsonb)
            AS x(item_id uuid, qty_g numeric);
          `,
          [productId, JSON.stringify(items)]
        )
      }
    }

    await client.query('COMMIT')

    // For consistency with createProduct you can just return message + productId
    return res.status(200).json({
      message: 'Product updated',
      productId,
    })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {
      // optional: log rollback error
    }
    next(err)
  } finally {
    client.release()
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const orgId = req.params.orgId
    const productId = req.params.productId

    const { rowCount } = await pool.query(
      `
      DELETE FROM finished_products
      WHERE org_id = $1 AND id = $2;
      `,
      [orgId, productId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Product not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function deleteProductRecipe(req, res, next) {
  try {
    const orgId = req.params.orgId
    const productId = req.params.productId
    const recipeId = req.params.recipeId

    const { rowCount } = await pool.query(
      `
      DELETE FROM finished_product_recipes
      USING finished_products
      WHERE finished_product_recipes.finished_product_id = finished_products.id
        AND finished_products.org_id = $1
        AND finished_product_recipes.finished_product_id = $2
        AND finished_product_recipes.recipe_id = $3;
      `,
      [orgId, productId, recipeId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Product recipe not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function deleteProductItem(req, res, next) {
  try {
    const orgId = req.params.orgId
    const productId = req.params.productId
    const itemId = req.params.itemId

    const { rowCount } = await pool.query(
      `
      DELETE FROM finished_product_items
      USING finished_products
      WHERE finished_product_items.finished_product_id = finished_products.id
        AND finished_products.org_id = $1
        AND finished_product_items.finished_product_id = $2
        AND finished_product_items.item_id = $3;
      `,
      [orgId, productId, itemId]
    )

    if (rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Product item not found in this organization' })
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
