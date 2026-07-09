#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const frontPort = Number(args["front-port"] || 3001);
const backendPort = Number(args["backend-port"] || 3000);
const page = normalizePage(args.page || "/");

const DEVICE_API_PATTERNS = [
  "getUserMedia",
  "enumerateDevices",
  "navigator.mediaDevices",
  "MediaRecorder",
  "RTCPeerConnection",
  "getDisplayMedia",
  "AudioContext",
  "webkitAudioContext",
];

const SKIP_DIRS = new Set([
  ".git",
  ".agents",
  ".claude",
  ".codex",
  ".codex-skill-staging",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".turbo",
]);

const SCAN_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".html",
  ".vue",
  ".svelte",
]);

const result = {
  cwd,
  page,
  defaults: {
    frontPort,
    backendPort,
  },
  lanIps: getLanIps(),
  package: readPackageInfo(cwd),
  deviceApiHints: scanForDeviceApis(cwd),
  ports: {},
};

for (const port of uniqueNumbers([frontPort, backendPort])) {
  result.ports[String(port)] = await getPortListeners(port);
}

console.log(JSON.stringify(result, null, 2));

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rawArgs[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function normalizePage(value) {
  if (!value || value === ".") return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const [name, interfaces] of Object.entries(nets)) {
    for (const item of interfaces || []) {
      if (item.family !== "IPv4" || item.internal) continue;
      ips.push({
        name,
        address: item.address,
        netmask: item.netmask,
        mac: item.mac,
      });
    }
  }
  return ips;
}

function readPackageInfo(root) {
  const packagePath = path.join(root, "package.json");
  const info = {
    exists: fs.existsSync(packagePath),
    packageManager: detectPackageManager(root),
    scripts: {},
  };

  if (!info.exists) return info;

  try {
    const json = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    info.name = json.name;
    info.scripts = json.scripts || {};
    info.dependencies = Object.keys(json.dependencies || {});
    info.devDependencies = Object.keys(json.devDependencies || {});
  } catch (error) {
    info.error = error.message;
  }

  return info;
}

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock"))) return "bun";
  return "npm";
}

function scanForDeviceApis(root) {
  const matches = [];
  walk(root, (filePath) => {
    const ext = path.extname(filePath);
    if (!SCAN_EXTENSIONS.has(ext)) return;

    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }

    for (const pattern of DEVICE_API_PATTERNS) {
      const index = text.indexOf(pattern);
      if (index === -1) continue;
      matches.push({
        file: path.relative(root, filePath),
        pattern,
      });
      break;
    }
  });

  return {
    needsHttpsLikely: matches.length > 0,
    matches: matches.slice(0, 50),
    truncated: matches.length > 50,
  };
}

function walk(dir, visit) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env") {
      if (SKIP_DIRS.has(entry.name)) continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath);
    }
  }
}

async function getPortListeners(port) {
  const lsofResult = await tryLsof(port);
  if (lsofResult.length > 0) return lsofResult;
  return tryNetstat(port);
}

async function tryLsof(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
    ]);
    return parseLsof(stdout);
  } catch {
    return [];
  }
}

function parseLsof(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const parts = line.trim().split(/\s+/);
    return {
      command: parts[0],
      pid: parts[1],
      user: parts[2],
      name: parts.slice(8).join(" "),
    };
  });
}

async function tryNetstat(port) {
  try {
    const { stdout } = await execFileAsync("netstat", ["-anv"]);
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.includes(`.${port} `) || line.includes(`:${port} `))
      .filter((line) => /LISTEN/i.test(line))
      .map((line) => ({ raw: line.trim() }));
  } catch {
    return [];
  }
}
