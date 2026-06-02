#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import {
  appendFileSync,
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const workspaceRoot = dirname(projectRoot);
const stateDir = join(projectRoot, ".ganhuo");
const statePath = join(stateDir, "preview-server.json");
const logPath = join(stateDir, "preview-server.log");
const siteLockPath = join(stateDir, "preview-server.lock");
const portLeaseDir = join(workspaceRoot, ".ganhuo");
const portLeasePath = join(portLeaseDir, "preview-port-leases.json");
const portLeaseLockPath = join(portLeaseDir, "preview-port-leases.lock");
const distDir = join(projectRoot, "dist");
const host = "127.0.0.1";
const command = process.argv[2] || "status";
const scriptPath = fileURLToPath(import.meta.url);
const managerName = "ganhuo-node-static-preview";
const maxLifetimeMs = durationFromEnv("GANHUO_PREVIEW_MAX_LIFETIME_MS", 2 * 60 * 60 * 1000);
const idleTimeoutMs = durationFromEnv("GANHUO_PREVIEW_IDLE_TIMEOUT_MS", 30 * 60 * 1000);
const lockWaitMs = durationFromEnv("GANHUO_PREVIEW_LOCK_WAIT_MS", 90_000);
const lockStaleMs = durationFromEnv("GANHUO_PREVIEW_LOCK_STALE_MS", 120_000);

try {
  switch (command) {
    case "start":
      await withSiteLock(() => start({ forceNewPort: false, reuseRunning: true }));
      break;
    case "restart":
      await withSiteLock(async () => {
        await stop({ quiet: true });
        await start({ forceNewPort: false, reuseRunning: false });
      });
      break;
    case "stop":
      await withSiteLock(() => stop({ quiet: false }));
      break;
    case "status":
      await status();
      break;
    case "doctor":
      await doctor();
      break;
    case "serve":
      await serve();
      break;
    case "dev":
      refuseDevServer();
      break;
    case "preview":
      refusePreviewAlias();
      break;
    default:
      usage();
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function start({ forceNewPort, reuseRunning }) {
  ensureProjectReady();
  mkdirSync(stateDir, { recursive: true });

  const existing = readState();
  if (existing?.pid && isAlive(existing.pid)) {
    if (await canControlState(existing)) {
      if (reuseRunning) {
        console.log(`LanderPilot preview ready: ${existing.url}`);
        console.log(`pid=${existing.pid}`);
        console.log(`node=${existing.nodePath || process.execPath}`);
        console.log(`log=${existing.logPath || logPath}`);
        return;
      }
      console.log(`Stopping existing preview server pid=${existing.pid}`);
      await terminate(existing.pid);
      await waitForHealthToStop(existing, 2_500);
    } else {
      console.log("Found an unverified preview record; leaving its process untouched and replacing the record.");
    }
  }
  removeState();

  const attempts = 3;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const port = await reservePreviewPort({ forceNewPort: forceNewPort || attempt > 0 });
    const result = await launchPreviewServer(port);
    try {
      await waitForHealth(result.state, () => result.exited, 20_000);
      await updatePreviewLease(result.state);
      console.log(`LanderPilot preview ready: ${result.state.url}`);
      console.log(`pid=${result.child.pid}`);
      console.log(`node=${process.execPath}`);
      console.log(`log=${logPath}`);
      return;
    } catch (error) {
      lastError = error;
      if (result.child.pid) await terminate(result.child.pid).catch(() => {});
      removeState();
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] static preview start attempt failed on ${host}:${port}\n`
      );
    }
  }

  throw new Error(
    [
      "Preview server failed to become ready.",
      lastError instanceof Error ? lastError.message : String(lastError),
      tailLog(),
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function stop({ quiet }) {
  const state = readState();
  if (!state?.pid) {
    removeState();
    if (!quiet) console.log("Preview server status: stopped");
    return;
  }
  if (!isKnownPreviewState(state)) {
    removeState();
    if (!quiet) console.log("Removed a preview record that does not belong to this site.");
    return;
  }
  if (!isAlive(state.pid)) {
    removeState();
    if (!quiet) console.log("Preview server status: stopped");
    return;
  }
  if (!(await canControlState(state))) {
    removeState();
    if (!quiet) console.log("Removed a stale preview record; process was not verified.");
    return;
  }

  await terminate(state.pid);
  await waitForHealthToStop(state, 2_500);
  removeState();
  await updatePreviewLease({ ...state, pid: null });
  if (!quiet) console.log(`Stopped preview server pid=${state.pid}`);
}

function launchPreviewServer(port) {
  const token = createToken();
  appendFileSync(logPath, `\n[${new Date().toISOString()}] starting static preview on ${host}:${port}\n`);
  const logFd = openSync(logPath, "a");
  const child = spawn(
    process.execPath,
    [scriptPath, "serve", "--host", host, "--port", String(port), "--token", token],
    {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      env: {
        ...process.env,
        GANHUO_PREVIEW_TOKEN: token,
        GANHUO_PREVIEW_MAX_LIFETIME_MS: String(maxLifetimeMs),
        GANHUO_PREVIEW_IDLE_TIMEOUT_MS: String(idleTimeoutMs),
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    }
  );
  closeSync(logFd);

  const result = {
    child,
    exited: false,
    state: createState({ pid: child.pid, port, token }),
  };
  child.once("exit", () => {
    result.exited = true;
  });
  child.unref();
  writeState(result.state);
  return result;
}

function createState({ pid, port, token }) {
  const url = `http://${host}:${port}/`;
  const now = new Date().toISOString();
  return {
    manager: managerName,
    pid,
    port,
    host,
    url,
    projectRoot,
    workspaceRoot,
    distDir,
    logPath,
    nodePath: process.execPath,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    token,
    maxLifetimeMs,
    idleTimeoutMs,
    startedAt: now,
    expiresAt: new Date(Date.now() + maxLifetimeMs).toISOString(),
    lastRequestAt: now,
    heartbeatAt: now,
  };
}

async function status() {
  const report = await getStatusReport();
  if (report.state === "stopped") {
    console.log("Preview server status: stopped");
    return;
  }
  console.log(`Preview server status: ${report.state}`);
  console.log(`url=${report.url}`);
  console.log(`pid=${report.pid}`);
  console.log(`node=${report.nodePath}`);
  console.log(`log=${report.logPath}`);
}

async function doctor() {
  const report = await getStatusReport();
  console.log("LanderPilot preview doctor");
  console.log(`platform=${process.platform}/${process.arch}`);
  console.log(`node=${process.execPath}`);
  console.log(`nodeVersion=${process.version}`);
  console.log(`cwd=${projectRoot}`);
  console.log(`dist=${existsSync(join(distDir, "index.html")) ? "ready" : "missing"}`);
  console.log(`status=${report.state}`);
  if (report.url) console.log(`url=${report.url}`);
  if (report.pid) console.log(`pid=${report.pid}`);
  console.log(`log=${logPath}`);
  const tail = tailLog();
  if (tail) console.log(tail);
}

async function getStatusReport() {
  const state = readState();
  if (!state?.pid || !isKnownPreviewState(state)) {
    if (state?.pid) removeState();
    return { state: "stopped" };
  }
  if (!isAlive(state.pid)) {
    removeState();
    return { state: "stopped" };
  }
  if (isLegacyPreviewState(state)) {
    const ready = await canReach(state.url);
    return {
      state: ready ? "running" : "unreachable",
      url: state.url,
      pid: state.pid,
      nodePath: state.nodePath || process.execPath,
      logPath: state.logPath || logPath,
    };
  }
  const heartbeatFresh = isHeartbeatFresh(state);
  const verified = await canReachHealth(state);
  return {
    state: verified && heartbeatFresh ? "running" : verified ? "unhealthy" : "unreachable",
    url: state.url,
    pid: state.pid,
    nodePath: state.nodePath || process.execPath,
    logPath: state.logPath || logPath,
  };
}

async function serve() {
  const args = parseArgs(process.argv.slice(3));
  const serveHost = args.host || host;
  const servePort = Number(args.port || 0);
  const token = args.token || process.env.GANHUO_PREVIEW_TOKEN || "";
  if (!servePort) throw new Error("Missing preview port.");
  ensureProjectReady();

  let lastRequestAt = Date.now();
  let shuttingDown = false;
  const server = createHttpServer((req, res) => {
    try {
      serveRequest(req, res, token, () => {
        lastRequestAt = Date.now();
      });
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1_500).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(servePort, serveHost, resolveListen);
  });
  appendFileSync(logPath, `[${new Date().toISOString()}] static preview listening on ${serveHost}:${servePort}\n`);
  touchHeartbeat(token, { lastRequestAt: new Date(lastRequestAt).toISOString() });
  setInterval(() => {
    if (!ownsCurrentState(token)) {
      appendFileSync(logPath, `[${new Date().toISOString()}] static preview state ownership lost\n`);
      shutdown();
      return;
    }
    touchHeartbeat(token, { lastRequestAt: new Date(lastRequestAt).toISOString() });
    if (Date.now() - lastRequestAt > idleTimeoutMs) {
      appendFileSync(logPath, `[${new Date().toISOString()}] static preview idle timeout reached\n`);
      shutdown();
    }
  }, 5_000).unref();
  setTimeout(() => {
    appendFileSync(logPath, `[${new Date().toISOString()}] static preview max lifetime reached\n`);
    shutdown();
  }, maxLifetimeMs).unref();
}

function serveRequest(req, res, token, markRequest) {
  if (!req.url) {
    sendNotFound(res);
    return;
  }
  const parsed = new URL(req.url, `http://${host}`);
  if (parsed.pathname === "/.ganhuo/preview-health") {
    sendHealth(res, parsed, token);
    return;
  }
  markRequest();
  const path = filePathForUrl(req.url);
  if (!path) {
    sendNotFound(res);
    return;
  }
  const stat = statSync(path);
  if (!stat.isFile()) {
    sendNotFound(res);
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentTypeFor(path));
  res.setHeader("cache-control", "no-store");
  createReadStream(path).pipe(res);
}

function filePathForUrl(url) {
  const parsed = new URL(url, `http://${host}`);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const candidates = [
    join(distDir, pathname),
    join(distDir, `${pathname}.html`),
    join(distDir, pathname, "index.html"),
  ];
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!isInsideDist(resolved)) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
  }
  return null;
}

function isInsideDist(path) {
  const root = resolve(distDir);
  return path === root || path.startsWith(`${root}${sep}`);
}

function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("Not found");
}

function sendHealth(res, parsed, token) {
  if (parsed.searchParams.get("token") !== token) {
    res.statusCode = 403;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(
    JSON.stringify({
      ok: true,
      manager: managerName,
      pid: process.pid,
      projectRoot,
      token,
    })
  );
}

function contentTypeFor(path) {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function refuseDevServer() {
  console.error(
    [
      "LanderPilot does not use `npm run dev`.",
      "Use `npm run ganhuo:preview:start` for a managed static preview server.",
      "Use `npm run ganhuo:preview:stop` before leaving the task.",
    ].join("\n")
  );
  process.exitCode = 1;
}

function refusePreviewAlias() {
  console.error(
    [
      "LanderPilot does not use `npm run preview`.",
      "Use `npm run ganhuo:preview:start` for a managed static preview server.",
      "Always follow with `npm run ganhuo:preview:status`.",
    ].join("\n")
  );
  process.exitCode = 1;
}

function usage() {
  console.log("Usage: node scripts/ganhuo-preview-server.mjs <start|restart|status|doctor|stop>");
}

function ensureProjectReady() {
  if (!existsSync(join(projectRoot, "package.json"))) {
    throw new Error("Run this command from the generated site directory.");
  }
  if (!existsSync(join(distDir, "index.html"))) {
    throw new Error("Static output is missing. Run `npm run build` first.");
  }
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeJsonFile(statePath, state);
}

function removeState() {
  rmSync(statePath, { force: true });
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmpPath, path);
}

async function withSiteLock(fn) {
  mkdirSync(stateDir, { recursive: true });
  const release = await acquireDirectoryLock(
    siteLockPath,
    "Timed out waiting for this site's preview lock."
  );
  try {
    return await fn();
  } finally {
    release();
  }
}

async function withPortLeaseLock(fn) {
  mkdirSync(portLeaseDir, { recursive: true });
  const release = await acquireDirectoryLock(
    portLeaseLockPath,
    "Timed out waiting for the LanderPilot preview port lease lock."
  );
  try {
    return await fn();
  } finally {
    release();
  }
}

async function acquireDirectoryLock(lockDir, timeoutMessage) {
  const deadline = Date.now() + lockWaitMs;
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        join(lockDir, "owner.json"),
        `${JSON.stringify(
          {
            pid: process.pid,
            command,
            projectRoot,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        )}\n`
      );
      return () => rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) {
        throw error;
      }
      if (isStaleLock(lockDir, lockStaleMs)) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      await sleep(50);
    }
  }
  throw new Error(timeoutMessage);
}

function isStaleLock(lockDir, staleAfterMs) {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

async function reservePreviewPort({ forceNewPort }) {
  return withPortLeaseLock(async () => {
    const leases = readPortLeases();
    const current = leases.find((lease) => lease.projectRoot === projectRoot);
    const reservedPorts = new Set(
      leases
        .filter((lease) => lease.projectRoot !== projectRoot)
        .map((lease) => Number(lease.port))
        .filter((port) => Number.isInteger(port) && port > 0)
    );

    if (!forceNewPort && current?.port && !(await isPortAvailable(current.port))) {
      current.updatedAt = new Date().toISOString();
      writePortLeases(leases);
      return current.port;
    }

    if (!forceNewPort && current?.port && !reservedPorts.has(current.port) && (await isPortAvailable(current.port))) {
      current.updatedAt = new Date().toISOString();
      writePortLeases(leases);
      return current.port;
    }

    const port = await findFreePort(reservedPorts);
    const now = new Date().toISOString();
    const nextLease = {
      projectRoot,
      workspaceRoot,
      port,
      host,
      url: `http://${host}:${port}/`,
      updatedAt: now,
    };
    const existingIndex = leases.findIndex((lease) => lease.projectRoot === projectRoot);
    if (existingIndex >= 0) {
      leases[existingIndex] = { ...leases[existingIndex], ...nextLease };
    } else {
      leases.push(nextLease);
    }
    writePortLeases(leases);
    return port;
  });
}

async function updatePreviewLease(state) {
  await withPortLeaseLock(async () => {
    const leases = readPortLeases();
    const now = new Date().toISOString();
    const nextLease = {
      projectRoot,
      workspaceRoot,
      port: state.port,
      host: state.host || host,
      url: state.url || `http://${host}:${state.port}/`,
      pid: Number.isInteger(state.pid) ? state.pid : null,
      startedAt: state.startedAt || null,
      updatedAt: now,
    };
    const existingIndex = leases.findIndex((lease) => lease.projectRoot === projectRoot);
    if (existingIndex >= 0) {
      leases[existingIndex] = { ...leases[existingIndex], ...nextLease };
    } else {
      leases.push(nextLease);
    }
    writePortLeases(leases);
  });
}

function readPortLeases() {
  try {
    const parsed = JSON.parse(readFileSync(portLeasePath, "utf8"));
    return Array.isArray(parsed.leases) ? parsed.leases.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writePortLeases(leases) {
  const normalized = leases
    .filter((lease) => lease && typeof lease.projectRoot === "string")
    .sort((a, b) => String(a.projectRoot).localeCompare(String(b.projectRoot)));
  writeJsonFile(portLeasePath, {
    kind: "ganhuo-preview-port-leases",
    version: 1,
    updatedAt: new Date().toISOString(),
    leases: normalized,
  });
}

function isManagedState(state) {
  return state.manager === managerName && state.projectRoot === projectRoot;
}

function isLegacyPreviewState(state) {
  return !state.manager && state.projectRoot === projectRoot && Boolean(state.url) && Boolean(state.logPath);
}

function isKnownPreviewState(state) {
  return isManagedState(state) || isLegacyPreviewState(state);
}

function isHeartbeatFresh(state) {
  if (!state.heartbeatAt) return false;
  return Date.now() - Date.parse(state.heartbeatAt) < 20_000;
}

async function canControlState(state) {
  return isManagedState(state) && isAlive(state.pid) && (await canReachHealth(state));
}

function touchHeartbeat(token, extra = {}) {
  const state = readState();
  if (!state || state.token !== token || state.pid !== process.pid || !isManagedState(state)) return;
  writeState({
    ...state,
    ...extra,
    heartbeatAt: new Date().toISOString(),
  });
}

function ownsCurrentState(token) {
  const state = readState();
  return Boolean(state && state.token === token && state.pid === process.pid && isManagedState(state));
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminate(pid) {
  if (!isAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await sleep(150);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Windows signal support is limited; SIGTERM already maps to process
    // termination there, so this branch is best-effort only.
  }
}

async function findFreePort(reservedPorts = new Set()) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise((resolvePort, reject) => {
      const server = createNetServer();
      server.once("error", reject);
      server.listen(0, host, () => {
        const address = server.address();
        const selectedPort = typeof address === "object" && address ? address.port : 0;
        server.close(() => resolvePort(selectedPort));
      });
    });
    if (port && !reservedPorts.has(port)) return port;
  }
  throw new Error("Unable to reserve a preview port.");
}

function isPortAvailable(port) {
  return new Promise((resolveAvailable) => {
    if (!Number.isInteger(port) || port <= 0) {
      resolveAvailable(false);
      return;
    }
    const server = createNetServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, host, () => {
      server.close(() => resolveAvailable(true));
    });
  });
}

async function waitForHealth(state, hasExited, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasExited()) throw new Error("Preview process exited early.");
    if (await canReachHealth(state)) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${state.url}`);
}

async function waitForHealthToStop(state, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await canReachHealth(state))) return;
    await sleep(150);
  }
}

function canReach(url) {
  return new Promise((resolveReachable) => {
    if (!url) {
      resolveReachable(false);
      return;
    }
    const req = httpRequest(url, { method: "GET", timeout: 1_000 }, (res) => {
      res.resume();
      resolveReachable(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.once("timeout", () => {
      req.destroy();
      resolveReachable(false);
    });
    req.once("error", () => resolveReachable(false));
    req.end();
  });
}

function canReachHealth(state) {
  return new Promise((resolveReachable) => {
    if (!state?.url || !state.token) {
      resolveReachable(false);
      return;
    }
    const healthUrl = new URL("/.ganhuo/preview-health", state.url);
    healthUrl.searchParams.set("token", String(state.token));
    const req = httpRequest(healthUrl, { method: "GET", timeout: 1_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) req.destroy();
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          resolveReachable(
            res.statusCode === 200 &&
              data.ok === true &&
              data.manager === managerName &&
              data.projectRoot === projectRoot &&
              data.token === state.token &&
              data.pid === state.pid
          );
        } catch {
          resolveReachable(false);
        }
      });
    });
    req.once("timeout", () => {
      req.destroy();
      resolveReachable(false);
    });
    req.once("error", () => resolveReachable(false));
    req.end();
  });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function createToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function tailLog() {
  try {
    const text = readFileSync(logPath, "utf8");
    const tail = text.split(/\r?\n/).slice(-20).join("\n").trim();
    return tail ? `Last preview log lines:\n${tail}` : "";
  } catch {
    return "";
  }
}

function durationFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(5_000, Math.min(value, 24 * 60 * 60 * 1000));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
