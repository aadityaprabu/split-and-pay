#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// The folder where this script lives (the repo root)
const repoFolder = __dirname;

function readEnvFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const envVariables = {};
    for (const line of lines) {
      const match = line.match(/^([^=\s]+)\s*=\s*(.*)$/);
      if (match) {
        envVariables[match[1]] = match[2].trim();
      }
    }
    return envVariables;
  } catch {
    return {};
  }
}

// Same ports start.js launched the backend and frontend on
const ports = [
  readEnvFile(path.join(repoFolder, "backend", "app", ".env")).BACKEND_PORT,
  readEnvFile(path.join(repoFolder, "frontend", ".env")).VITE_PORT,
].filter(Boolean);
const platform = process.platform;

for (const port of ports) {
  try {
    let pid;
    if (platform === "win32") {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const match = output.match(/LISTENING\s+(\d+)/);
      pid = match?.[1];
    } else {
      pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim().split("\n").join(" ");
    }

    if (pid) {
      if (platform === "win32") {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      }
      console.log(`Killed :${port} (PID ${pid})`);
    } else {
      console.log(`Nothing on :${port}`);
    }
  } catch {
    console.log(`Nothing on :${port}`);
  }
}

// Stop the Postgres container
try {
  execSync("docker compose --env-file .env --env-file backend/app/.env stop postgres", { cwd: repoFolder, stdio: "inherit" });
} catch {
  console.log("Could not stop Postgres (is Docker running?)");
}
