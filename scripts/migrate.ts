import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config(); // load .env

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const pool = new Pool({ connectionString: DATABASE_URL });

const migrations = [
  "0003_message_history.sql",
];

for (const file of migrations) {
  const sql = readFileSync(join("src/lib/server/db/migrations", file), "utf-8");
  console.log(`Running ${file}...`);
  await pool.query(sql);
  console.log(`✓ ${file} done`);
}

await pool.end();
console.log("Migration terminée.");
