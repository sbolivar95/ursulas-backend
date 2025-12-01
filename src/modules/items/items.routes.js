import { Router } from 'express'
import {
  authenticate,
  requireRole,
  requireOrgMatchFromParam,
} from '../../middleware/auth.js'
import {
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  returnUnits,
  returnCategories,
} from './items.controller.js'

export const itemsRouter = Router()

// All routes: /orgs/:orgId/items...

// Create item (OWNER or MANAGER)
itemsRouter.post(
  '/:orgId/items/create',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  createItem
)

// List items
itemsRouter.get(
  '/:orgId/items/get',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  listItems
)

// Get single item
itemsRouter.get(
  '/:orgId/items/:itemId/get_by_id',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  getItemById
)

// Update item (partial or full, here using PATCH)
itemsRouter.patch(
  '/:orgId/items/:itemId/update',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  updateItem
)

// Delete item
itemsRouter.delete(
  '/:orgId/items/:itemId/delete',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteItem
)

itemsRouter.get('/units', authenticate, returnUnits)

itemsRouter.get('/:orgId/categories', authenticate, returnCategories)
