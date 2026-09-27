const fs = require("fs");
const path = require("path");
const { assertRequiredEnvironment } = require("../constants/environment");
const { pool } = require("../config/db");

const migrationsFolder = path.join(__dirname, "migrations");

/**
 * Applies every .sql file in database/migrations that hasn't run yet, in filename order.
 * Each file runs in its own transaction and is recorded in schema_migrations.
 * Never edit a migration that has already been applied — add a new numbered file instead.
 */
async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const appliedMigrations = new Set(rows.map((row) => row.name));

  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const fileName of migrationFiles) {
    if (appliedMigrations.has(fileName)) continue;

    const sql = fs.readFileSync(path.join(migrationsFolder, fileName), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [fileName]);
      await client.query("COMMIT");
      console.log(`  [migrated] ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${fileName} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
}

// Allow `npm run migrate` to run this file directly
if (require.main === module) {
  assertRequiredEnvironment();
  runMigrations()
    .then(() => console.log("Migrations complete."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = runMigrations;
