const { Environment, assertRequiredEnvironment } = require("./constants/environment");
const { pool } = require("./config/db");
const runMigrations = require("./database/migrate");
const setupApp = require("./setup");

assertRequiredEnvironment();
console.log(`Environment: ${Environment.ENV}`);
console.log(`Backend port: ${Environment.BACKEND_PORT}`);

const app = setupApp();

async function startServer() {
  console.log("Running database migrations...");
  await runMigrations();

  const server = app.listen(Environment.BACKEND_PORT, () => {
    console.log(`Server running on port ${Environment.BACKEND_PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
