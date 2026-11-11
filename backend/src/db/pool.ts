import pg from "pg";
import type { QueryResultRow } from "pg";
import { config } from "../config.js";

const ssl = config.nodeEnv === 'production' ? {rejectUnauthorized: false} : false;

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("PostgreSQL Pool Error:", err);
});

export const query = async <T extends QueryResultRow>(
  text: string,
  params?: unknown[]
) => {
  try {
    return await pool.query<T>(text, params);
  } catch (err) {
    console.error("Database Query Error:", err);
    throw err;
  }
};
