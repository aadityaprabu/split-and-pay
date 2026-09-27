#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// The folder where this script lives (the repo root)
const repoFolder = __dirname;

// App folders that need their dependencies installed
const appFolders = ["backend/app", "frontend"];

// Each app pins Yarn 4 in its .yarn/releases; any global `yarn` (even 1.x) hands off to that version
function ensureYarnIsInstalled() {
  try {
    execSync("yarn --version", { stdio: "ignore" });
  } catch {
    console.error("Yarn isn't installed. Install it once with: npm install -g yarn");
    process.exit(1);
  }
}

// Runs a shell command in a given folder
function runCommand(command, inFolder = repoFolder) {
  execSync(command, { cwd: inFolder, stdio: "inherit" });
}

// ─── Step 1: Install dependencies for each app ───────────────────────────────

console.log("Setting up Split & Pay...\n");
ensureYarnIsInstalled();

for (const relativeFolder of appFolders) {
  const appFolder = path.join(repoFolder, relativeFolder);
  const hasPackageJson = fs.existsSync(path.join(appFolder, "package.json"));

  if (!hasPackageJson) {
    console.log(`  [skip] ${relativeFolder} — no package.json`);
    continue;
  }

  console.log(`  yarn install → ${relativeFolder}`);
  runCommand("yarn install", appFolder);
  console.log("");
}

// ─── Step 2: Scaffold .env files ─────────────────────────────────────────────

runCommand("node generateEnvFiles.js");

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log(`
Setup complete. Next steps:

  1. Fill in the empty values in (not committed to git):
       backend/app/.env → GOOGLE_CLIENT_ID, ADMIN_EMAIL

  2. Start all services:
       node start.js
`);
