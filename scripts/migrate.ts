import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    const migrationPath = path.join(
      import.meta.dirname,
      "../src/lib/server/db/migrations/0001_prospect_tables.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");
    console.log("Running migration...");
    await client.query(sql);
    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
