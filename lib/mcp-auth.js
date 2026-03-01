import { getSQL } from "./db.js";

let cachedKey = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function validateMcpKey(request) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;

  const token = auth.slice(7);

  // Cache the key lookup
  if (!cachedKey || Date.now() - cacheTime > CACHE_TTL) {
    const sql = getSQL();
    const [row] = await sql`SELECT value FROM settings WHERE key = 'mcp_api_key'`;
    cachedKey = row?.value || null;
    cacheTime = Date.now();
  }

  return token === cachedKey;
}
