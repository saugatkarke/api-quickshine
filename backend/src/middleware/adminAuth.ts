import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required')
}

export const requireAdminToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.header('authorization')
  const [scheme, token] = authorization?.split(' ') ?? []

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
