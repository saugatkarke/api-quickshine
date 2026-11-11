import { Client } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import 'dotenv/config'

const ssl = process.env.NODE_ENV === 'production' || process.env.DATABASE_SSL === 'true'
  ? { rejectUnauthorized: false }
  : false

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl
  });

  await client.connect();

  const migrationsDir = join(process.cwd(), "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    console.log(`Executed migration: ${file}`);
  }

  await client.end();

  console.log("✅ Migration completed");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
