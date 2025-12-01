import { Router } from 'express'
import {
  authenticate,
  requireRole,
  requireOrgMatchFromParam,
} from '../../middleware/auth.js'
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProductRecipe,
  deleteProductItem,
  deleteProduct,
} from './products.controller.js'

export const productsRouter = Router()

productsRouter.post(
  '/:orgId/:userCode/create_product',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  createProduct
)

productsRouter.get(
  '/:orgId/return_product_list',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  listProducts
)

productsRouter.get(
  '/:orgId/products/:productId/return_single_product',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  getProductById
)

productsRouter.patch(
  '/:orgId/products/:productId/update_product',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  updateProduct
)

productsRouter.delete(
  '/:orgId/products/:productId/delete_product',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteProduct
)

productsRouter.delete(
  '/:orgId/products/:productId/recipes/:recipeId/delete_product_recipe',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteProductRecipe
)

productsRouter.delete(
  '/:orgId/products/:productId/items/:itemId/delete_product_item',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteProductItem
)
