#!/usr/bin/env node

const { execSync, exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// The folder where this script lives (the repo root)
const repoFolder = __dirname;

// Detect which OS we are on
const operatingSystem = process.platform; // "win32", "darwin", or "linux"

// ─── Read .env files ─────────────────────────────────────────────────────────

function readEnvFile(filePath) {
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const envVariables = {};
    for (const line of lines) {
      const match = line.match(/^([^=\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        envVariables[key] = value;
      }
    }
    return envVariables;
  } catch {
    return {};
  }
}

const backendEnvFile = path.join(repoFolder, "backend", "app", ".env");
const frontendEnvFile = path.join(repoFolder, "frontend", ".env");
const backendPort = readEnvFile(backendEnvFile).BACKEND_PORT || "?";
const postgresPort = readEnvFile(backendEnvFile).POSTGRES_PORT || "?";
const frontendPort = readEnvFile(frontendEnvFile).VITE_PORT || "?";

// ─── Verify every .env file exists and is fully filled in ────────────────────
//
// Keeps this in sync with the file/key list in generateEnvFiles.js.

const requiredEnvFiles = [
  {
    filePath: backendEnvFile,
    keys: [
      "ENV",
      "BACKEND_PORT",
      "POSTGRES_HOST",
      "POSTGRES_PORT",
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "POSTGRES_DB",
      "GOOGLE_CLIENT_ID",
      "ADMIN_EMAIL",
    ],
  },
  {
    filePath: frontendEnvFile,
    keys: ["VITE_PORT", "VITE_BASE_URL", "VITE_BACKEND_URL", "VITE_DEV_PROXY_TARGET"],
  },
];

function verifyEnvFilesAreFilled() {
  console.log("Verifying .env files...");
  let hasErrors = false;

  for (const { filePath, keys } of requiredEnvFiles) {
    const relativePath = path.relative(repoFolder, filePath);

    if (!fs.existsSync(filePath)) {
      console.error(`  [missing] ${relativePath} — run "node generateEnvFiles.js" first`);
      hasErrors = true;
      continue;
    }

    const envVariables = readEnvFile(filePath);
    const problems = [];

    for (const key of keys) {
      const value = envVariables[key];
      if (value === undefined || value === "") {
        problems.push(`${key} is empty`);
      } else if (/<[^>]+>/.test(value)) {
        problems.push(`${key} still has a placeholder value (${value})`);
      }
    }

    if (problems.length > 0) {
      console.error(`  [incomplete] ${relativePath}`);
      for (const problem of problems) {
        console.error(`      - ${problem}`);
      }
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("\nFix the .env files above, then re-run: node start.js");
    process.exit(1);
  }

  console.log("  All .env files are filled in.\n");
}

// ─── Open a new terminal window for a service ────────────────────────────────

function openNewTerminalWindow(windowTitle, folderPath, commandToRun) {
  if (operatingSystem === "win32") {
    // On Windows: use cmd's "start" command to open a new PowerShell window
    exec(`start "${windowTitle}" powershell -NoExit -Command "$host.UI.RawUI.WindowTitle = '${windowTitle}'; Set-Location '${folderPath}'; ${commandToRun}"`);

  } else if (operatingSystem === "darwin") {
    // On macOS: use AppleScript to open a new Terminal window
    const appleScript = `tell application "Terminal" to do script "printf '\\\\033]0;${windowTitle}\\\\007'; cd '${folderPath}' && ${commandToRun}"`;
    spawn("osascript", ["-e", appleScript], { detached: true, stdio: "ignore" }).unref();

  } else {
    // On Linux: try common terminal emulators until one works
    const linuxTerminalOptions = [
      ["gnome-terminal", ["--title", windowTitle, "--", "bash", "-c", `cd '${folderPath}' && ${commandToRun}; exec bash`]],
      ["x-terminal-emulator", ["-T", windowTitle, "-e", `bash -c "cd '${folderPath}' && ${commandToRun}; exec bash"`]],
      ["konsole",            ["--title", windowTitle, "-e", `bash -c "cd '${folderPath}' && ${commandToRun}; exec bash"`]],
      ["xfce4-terminal",     ["--title", windowTitle, "-e", `bash -c "cd '${folderPath}' && ${commandToRun}; exec bash"`]],
      ["xterm",              ["-T",      windowTitle, "-e", `bash -c "cd '${folderPath}' && ${commandToRun}; exec bash"`]],
    ];

    for (const [terminalApp, terminalArgs] of linuxTerminalOptions) {
      try {
        execSync(`which ${terminalApp}`, { stdio: "ignore" });
        spawn(terminalApp, terminalArgs, { detached: true, stdio: "ignore" }).unref();
        return;
      } catch {
        continue; // this terminal app is not installed, try the next one
      }
    }

    console.warn(`  [warn] No terminal emulator found — could not open window for: ${windowTitle}`);
  }
}

// ─── Make sure Docker is running before we do anything ───────────────────────

function ensureDockerIsRunning() {
  const isDockerRunning = () => {
    try {
      execSync("docker ps", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  if (isDockerRunning()) {
    console.log("Docker is running.");
    return;
  }

  console.log("Docker is not running. Starting Docker Desktop...");

  if (operatingSystem === "win32") {
    exec(`start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"`);
  } else if (operatingSystem === "darwin") {
    exec("open -a Docker");
  } else {
    exec("systemctl start docker");
  }

  // Wait up to 90 seconds (30 attempts × 3 seconds) for Docker to be ready
  process.stdout.write("Waiting for Docker to be ready");
  let dockerIsReady = false;

  for (let attempt = 0; attempt < 30; attempt++) {
    if (isDockerRunning()) {
      dockerIsReady = true;
      break;
    }
    process.stdout.write(".");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000); // wait 3 seconds
  }

  console.log("");

  if (!dockerIsReady) {
    console.error("Docker did not start in time. Please start it manually and retry.");
    process.exit(1);
  }

  console.log("Docker is ready.");
}

// ─── All Node.js services to open in separate terminal windows ───────────────

const services = [
  {
    windowTitle: `Split & Pay - Backend :${backendPort}`,
    folderPath: path.join(repoFolder, "backend", "app"),
    command: "node --watch src/server.js",
  },
  {
    windowTitle: `Split & Pay - Frontend :${frontendPort}`,
    folderPath: path.join(repoFolder, "frontend"),
    command: "npm run dev",
  },
];

// ─── Run everything ──────────────────────────────────────────────────────────

verifyEnvFilesAreFilled();
ensureDockerIsRunning();

// Only Postgres runs in Docker locally — backend/frontend run natively for hot reload.
// The root .env fills the rest of the compose file; backend/app/.env (listed last, so it wins)
// supplies the POSTGRES_* credentials and host port the container is created with.
// --wait blocks until the healthcheck passes, so the backend's migrations can connect.
console.log("Starting Postgres...");
execSync("docker compose --env-file .env --env-file backend/app/.env up -d --wait postgres", {
  cwd: repoFolder,
  stdio: "inherit",
});

for (const service of services) {
  console.log(`Starting ${service.windowTitle}...`);
  openNewTerminalWindow(service.windowTitle, service.folderPath, service.command);
}

console.log("");
console.log("All services started:");
console.log(`  Postgres : localhost:${postgresPort}`);
console.log(`  Backend  : http://localhost:${backendPort}`);
console.log(`  Frontend : http://localhost:${frontendPort}`);
