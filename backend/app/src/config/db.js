const { Pool, types } = require("pg");
const { Environment } = require("../constants/environment");
const { Database } = require("../constants/constants");

// pg returns BIGINT as a string because it can exceed Number.MAX_SAFE_INTEGER. Our BIGINTs are paise
// amounts capped far below that (Expense.MAX_AMOUNT_MINOR), so plain numbers are safe and easier to use.
types.setTypeParser(types.builtins.INT8, Number);
// Keep DATE columns as "YYYY-MM-DD". The default parses them to a Date at local midnight, which then
// serialises to the previous day in any timezone east of UTC.
types.setTypeParser(types.builtins.DATE, (value) => value);

const pool = new Pool({
  host: Environment.POSTGRES_HOST,
  port: Environment.POSTGRES_PORT,
  user: Environment.POSTGRES_USER,
  password: Environment.POSTGRES_PASSWORD,
  database: Environment.POSTGRES_DB,
  max: Database.POOL_MAX_CONNECTIONS,
});

console.log("Postgres configuration:", {
  host: pool.options.host,
  port: pool.options.port,
  user: pool.options.user,
  database: pool.options.database,
  password: pool.options.password ? "******" : undefined,
});

pool.on("error", (error) => {
  console.error("Unexpected Postgres pool error:", error);
});

/**
 * Runs `work(client)` inside a transaction; commits on success, rolls back on throw.
 * Use this for anything that writes to more than one table (e.g. an expense + its splits).
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
