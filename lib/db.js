import { neon } from "@neondatabase/serverless";

let _sql = null;

export function getSQL() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export async function query(text, params = []) {
  const sql = getSQL();
  return sql.query(text, params);
}

export async function healthCheck() {
  try {
    const sql = getSQL();
    const rows = await sql`SELECT COUNT(*) AS cnt FROM models WHERE is_active = true`;
    return {
      connected: true,
      active_models: Number(rows[0].cnt),
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
