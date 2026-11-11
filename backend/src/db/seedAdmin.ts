import bcrypt from 'bcrypt'
import { query } from './pool.js'

export async function seedAdminUser() {
  const email = 'admin@quickshine.com'
  const defaultPassword = 'admin123'

  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email])
  if (existing.rowCount && existing.rowCount > 0) {
    return // already seeded, don't overwrite an existing/possibly-changed password
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 12)

  await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')`,
    [email, passwordHash]
  )

  console.log(`Seeded default admin user: ${email} (password: ${defaultPassword} — change this immediately)`)
}