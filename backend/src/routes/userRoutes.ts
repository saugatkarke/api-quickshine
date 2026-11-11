// routes/userRoutes.ts
import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAdminToken } from '../middleware/adminAuth.js'
import { validationErrorResponse } from '../utils/validation.js'

const router = Router()
router.use(requireAdminToken)

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'staff']).default('admin'),
})

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  role: z.enum(['admin', 'staff']).optional(),
  is_active: z.boolean().optional(),
})

// List all users (never return password_hash)
router.get('/users', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    )
    res.json({ users: result.rows })
  } catch (error) {
    next(error)
  }
})

// Create a new admin/staff user
router.post('/users', async (req, res, next) => {
  try {
    const { email, password, role } = createUserSchema.parse(req.body)

    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email])
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json(validationErrorResponse({ email: ['A user with this email already exists'] }))
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const result = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, is_active, created_at, updated_at`,
      [email, passwordHash, role]
    )

    return res.status(201).json(result.rows[0])
  } catch (error) {
    return next(error)
  }
})

// Update a user (email, password, role, active status)
router.patch('/users/:id', async (req, res, next) => {
  try {
    const updates = updateUserSchema.parse(req.body)

    if (Object.keys(updates).length === 0) {
      return res.status(400).json(validationErrorResponse({ root: ['At least one field must be provided to update'] }))
    }

    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`)
      values.push(updates.email)
    }
    if (updates.password !== undefined) {
      const passwordHash = await bcrypt.hash(updates.password, 12)
      setClauses.push(`password_hash = $${paramIndex++}`)
      values.push(passwordHash)
    }
    if (updates.role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`)
      values.push(updates.role)
    }
    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`)
      values.push(updates.is_active)
    }

    setClauses.push(`updated_at = now()`)
    values.push(req.params.id)

    const result = await query(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, role, is_active, created_at, updated_at`,
      values
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json(result.rows[0])
  } catch (error) {
    return next(error)
  }
})


// Delete a user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [req.params.id]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
})

export default router

