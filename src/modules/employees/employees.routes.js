import { Router } from 'express'
import {
  authenticate,
  requireRole,
  requireOrgMatchFromParam,
} from '../../middleware/auth.js'

import {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from './employees.controller.js'

export const employeesRouter = Router()

employeesRouter.get(
  '/:orgId/employees/return_list',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  listEmployees
)

employeesRouter.get(
  '/:orgId/employees/:memberId/return_single_employee',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  getEmployeeById
)

employeesRouter.post(
  '/:orgId/employees/create',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  createEmployee
)

employeesRouter.patch(
  '/:orgId/employees/:memberId/update_employee',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  updateEmployee
)

employeesRouter.delete(
  '/:orgId/employees/:memberId/delete_employee',
  authenticate,
  requireOrgMatchFromParam('orgId'),
  requireRole('OWNER', 'MANAGER'),
  deleteEmployee
)
