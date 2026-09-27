#!/usr/bin/env node
// Runs the integration tests against a throwaway Postgres in Docker:
// start a container on a free port → wait until it accepts connections → run the tests → always remove it.
// Your local dev database is never touched.

const { execFileSync, spawn } = require("child_process");
const net = require("net");
const path = require("path");
const { Client } = require("pg");

const TestDatabase = Object.freeze({
  IMAGE: "postgres:18-alpine",
  USER: "splitandpay_test",
  PASSWORD: "integration-test-password",
  NAME: "splitandpay_test",
  STARTUP_TIMEOUT_MS: 60_000,
  RETRY_INTERVAL_MS: 250,
});

// Handed to the test process as env vars; the app reads them through constants/environment.js as usual
const TestEnvironment = Object.freeze({
  ENV: "TEST",
  BACKEND_PORT: "0", // unused: each test file listens on a random port
  GOOGLE_CLIENT_ID: "integration-test-client.apps.googleusercontent.com",
  ADMIN_EMAIL: "admin@example.com",
});

const appFolder = path.join(__dirname, "..", "..");
const containerName = `split-and-pay-integration-${process.pid}`;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// The image runs a temporary socket-only server while it initialises, so wait for a real TCP connection
async function waitForPostgres(port) {
  const deadline = Date.now() + TestDatabase.STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const client = new Client({
      host: "127.0.0.1",
      port,
      user: TestDatabase.USER,
      password: TestDatabase.PASSWORD,
      database: TestDatabase.NAME,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, TestDatabase.RETRY_INTERVAL_MS));
    }
  }
  throw new Error(`Postgres didn't start within ${TestDatabase.STARTUP_TIMEOUT_MS / 1000}s`);
}

function removeContainer() {
  try {
    execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  } catch {
    // Already gone
  }
}

function runTests(port) {
  return new Promise((resolve) => {
    const testProcess = spawn(
      process.execPath,
      // One file at a time: they share the database and each one wipes it between tests
      ["--test", "--test-concurrency=1", "test/integration/**/*.integration.test.js"],
      {
        cwd: appFolder,
        stdio: "inherit",
        env: {
          ...process.env,
          ...TestEnvironment,
          POSTGRES_HOST: "127.0.0.1",
          POSTGRES_PORT: String(port),
          POSTGRES_USER: TestDatabase.USER,
          POSTGRES_PASSWORD: TestDatabase.PASSWORD,
          POSTGRES_DB: TestDatabase.NAME,
        },
      }
    );
    testProcess.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    console.error("Docker isn't running. Start Docker Desktop and try again.");
    process.exit(1);
  }

  const port = await findFreePort();
  process.on("SIGINT", () => {
    removeContainer();
    process.exit(130);
  });

  console.log(`Starting throwaway Postgres (${containerName}) on 127.0.0.1:${port}...`);
  execFileSync(
    "docker",
    [
      "run", "-d", "--rm",
      "--name", containerName,
      "-e", `POSTGRES_USER=${TestDatabase.USER}`,
      "-e", `POSTGRES_PASSWORD=${TestDatabase.PASSWORD}`,
      "-e", `POSTGRES_DB=${TestDatabase.NAME}`,
      "-p", `127.0.0.1:${port}:5432`,
      "--tmpfs", "/var/lib/postgresql", // in memory: faster, and nothing left on disk
      TestDatabase.IMAGE,
    ],
    { stdio: "ignore" }
  );

  let exitCode;
  try {
    await waitForPostgres(port);
    exitCode = await runTests(port);
  } finally {
    removeContainer();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  removeContainer();
  process.exit(1);
});
