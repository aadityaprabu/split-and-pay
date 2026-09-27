#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// The folder where this script lives (the repo root)
const repoFolder = __dirname;

// Re-run with --force to overwrite .env files that already exist
const shouldForceOverwrite = process.argv.includes("--force");

// Local-only database password. The Postgres container is created with it on first
// start, so backend/app/.env and the root .env must share the same value.
const localPostgresPassword = crypto.randomBytes(18).toString("base64url");

// ─── .env files to scaffold ───────────────────────────────────────────────
//
// The backend loads backend/app/.env via dotenv, and
// Vite loads frontend/.env from the frontend folder (see start.js).
//
// Values left as "" must be filled in by hand: GOOGLE_CLIENT_ID (the frontend fetches it from
// the backend) and ADMIN_EMAIL, your Google account. You then add the other people from the
// app's admin page.

const envFilesToGenerate = [
  {
    filePath: path.join(repoFolder, "backend", "app", ".env"),
    values: {
      ENV: "LOCAL",
      BACKEND_PORT: "4000",
      POSTGRES_HOST: "localhost",
      POSTGRES_PORT: "5432",
      POSTGRES_USER: "splitandpay",
      POSTGRES_PASSWORD: localPostgresPassword,
      POSTGRES_DB: "splitandpay",
      GOOGLE_CLIENT_ID: "",
      ADMIN_EMAIL: "",
    },
  },
  {
    filePath: path.join(repoFolder, "frontend", ".env"),
    values: {
      VITE_PORT: "4001",
      VITE_BASE_URL: "/",
      VITE_BACKEND_URL: "/split-and-pay",
      VITE_DEV_PROXY_TARGET: "http://localhost:4000",
    },
  },
  {
    // Shared .env for docker compose (read automatically from the repo root).
    // Values are container-side: Postgres is reached by its service name, and the
    // frontend calls the backend through the nginx BACKEND_URL (/split-and-pay) proxy.
    // frontend/Dockerfile maps BACKEND_URL and FRONTEND_BASE_URL to the VITE_ names Vite needs,
    // and nginx reads FRONTEND_PORT, BACKEND_URL and BACKEND_PORT when the container starts.
    filePath: path.join(repoFolder, ".env"),
    values: {
      ENV: "LOCAL",
      BACKEND_PORT: "4000",
      POSTGRES_HOST: "postgres",
      POSTGRES_PORT: "5432",
      POSTGRES_USER: "splitandpay",
      POSTGRES_PASSWORD: localPostgresPassword,
      POSTGRES_DB: "splitandpay",
      GOOGLE_CLIENT_ID: "",
      ADMIN_EMAIL: "",
      FRONTEND_PORT: "4001",
      FRONTEND_BASE_URL: "/",
      BACKEND_URL: "/split-and-pay",
    },
  },
];

// ─── Generate each .env file ───────────────────────────────────────────────

console.log("Generating .env files for Split & Pay...\n");

for (const { filePath, values } of envFilesToGenerate) {
  const relativePath = path.relative(repoFolder, filePath);

  if (fs.existsSync(filePath) && !shouldForceOverwrite) {
    console.log(`  [skip] ${relativePath} — already exists (use --force to overwrite)`);
    continue;
  }

  const keys = Object.keys(values);
  const fileContents = keys.map((key) => `${key}=${values[key]}`).join("\n") + "\n";

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, fileContents);

  console.log(`  [created] ${relativePath} (${keys.length} keys)`);
}

console.log("\nFill in GOOGLE_CLIENT_ID and ADMIN_EMAIL by hand (see README).");

if (shouldForceOverwrite) {
  console.log(`
Note: --force generated a new POSTGRES_PASSWORD. An existing local Postgres volume
still has the old one — reset it with:
  docker compose --env-file .env --env-file backend/app/.env down -v`);
}
