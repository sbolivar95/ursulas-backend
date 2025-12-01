import { Router } from 'express'
import {
  authenticate,
  requireRole,
  requireOrgMatchFromParam,
} from '../../middleware/auth.js'
import {
  listRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipeItems,
  upsertRecipeItem,
  deleteRecipeItem,
} from './recipes.controller.js'

export const recipesRouter = Router()

// /orgs/:orgId/recipes...

recipesRouter.post(
  '/:orgId/:userCode/recipes/create',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  createRecipe
)

recipesRouter.get(
  '/:orgId/recipes/return_list',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  listRecipes
)

recipesRouter.get(
  '/:orgId/recipes/:recipeId/return_single_recipe',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  getRecipeById
)

recipesRouter.patch(
  '/:orgId/:userCode/recipes/:recipeId/update_recipe',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  updateRecipe
)

recipesRouter.delete(
  '/:orgId/recipes/:recipeId/delete_recipe',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteRecipe
)

// ---- nested: recipe items ----

// List items in a recipe
recipesRouter.get(
  '/:orgId/recipes/:recipeId/items',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  listRecipeItems
)

// Upsert an item in a recipe
recipesRouter.put(
  '/:orgId/recipes/:recipeId/items/:itemId/update_recipe_item',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  upsertRecipeItem
)

// Delete an item from a recipe
recipesRouter.delete(
  '/:orgId/recipes/:recipeId/items/:itemId/delete_recipe_item',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteRecipeItem
)
