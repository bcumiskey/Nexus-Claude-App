/**
 * Deploy Nexus schema to Neon Postgres.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node db/deploy.mjs
 *
 * Safe to run multiple times — uses IF NOT EXISTS and ON CONFLICT DO NOTHING.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function deploy() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    console.error("  Example: DATABASE_URL='postgresql://...' node db/deploy.mjs");
    process.exit(1);
  }

  const sql = neon(url);
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  console.log("Deploying Nexus schema...");

  // Split on semicolons and run each statement
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    try {
      await sql.query(stmt);
    } catch (err) {
      // Skip errors for IF NOT EXISTS / ON CONFLICT
      if (
        err.message.includes("already exists") ||
        err.message.includes("duplicate key")
      ) {
        continue;
      }
      console.error("Statement failed:", stmt.slice(0, 80) + "...");
      console.error("Error:", err.message);
      throw err;
    }
  }

  // Verify
  const models = await sql`SELECT id, label, is_default, is_enhancement FROM models`;
  console.log(`\nDeployed successfully. Models in database:`);
  for (const m of models) {
    const flags = [];
    if (m.is_default) flags.push("DEFAULT");
    if (m.is_enhancement) flags.push("ENHANCEMENT");
    console.log(`  ${m.id} — ${m.label}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
  }
  console.log(`\nTotal: ${models.length} models`);
}

deploy().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
