#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scaffoldDir = join(skillRoot, "scaffold");

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspace = requireArg(args.workspace, "Missing --workspace.");
  const siteName = requireArg(args.name, "Missing --name.");
  const title = args.title || siteName;

  assertSiteName(siteName);
  const workspaceRoot = resolve(workspace);
  const siteDir = resolve(workspaceRoot, siteName);
  if (!isInside(siteDir, workspaceRoot)) {
    throw new Error("Site directory must stay inside the workspace.");
  }
  if (!existsSync(scaffoldDir)) {
    throw new Error(`Missing LanderPilot scaffold: ${scaffoldDir}`);
  }
  if (existsSync(siteDir) && readdirSync(siteDir).length > 0) {
    throw new Error(`Site directory already exists and is not empty: ${siteDir}`);
  }

  mkdirSync(siteDir, { recursive: true });
  cpSync(scaffoldDir, siteDir, {
    recursive: true,
    force: true,
    filter: shouldCopyScaffoldEntry,
  });
  writeSiteManifest(siteDir, title);
  await writeWorkspaceIndex(workspaceRoot, { siteName, siteDir, title });

  console.log(`LanderPilot site scaffold ready: ${siteDir}`);
  console.log(`relative=${relative(workspaceRoot, siteDir) || "."}`);
  console.log(`manifest=${join(siteDir, "public", ".ganhuo", "site.json")}`);
  console.log(`index=${join(workspaceRoot, ".ganhuo", "landerpilot-sites.json")}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function requireArg(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function assertSiteName(siteName) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(siteName)) {
    throw new Error(
      "Site name must be lowercase letters, numbers, and hyphens, without leading or trailing hyphens."
    );
  }
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !rel.startsWith("/") && !/^[A-Za-z]:/.test(rel));
}

function shouldCopyScaffoldEntry(source) {
  const relPath = relative(scaffoldDir, source).replaceAll("\\", "/");
  if (!relPath) return true;
  const parts = relPath.split("/");
  if (parts.includes("node_modules") || parts.includes(".astro") || parts.includes(".DS_Store")) {
    return false;
  }
  if (parts[0] === "dist") return false;
  if (
    parts[0] === ".ganhuo" &&
    ["deployment-handoff.json", "preview-server.json", "preview-server.log", "preview-server.lock"].includes(
      parts[1]
    )
  ) {
    return false;
  }
  return true;
}

function writeSiteManifest(siteDir, title) {
  const manifestDir = join(siteDir, "public", ".ganhuo");
  mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    kind: "static-site",
    title,
    entry: "index.html",
    pages: ["index.html"],
    framework: "astro",
    template: "bare",
    createdBy: "landerpilot",
    deployment: deploymentContract(),
  };
  writeFileSync(join(manifestDir, "site.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function deploymentContract() {
  return {
    targetKind: "static-site",
    framework: "astro",
    outputDir: "dist",
    artifactKind: "static-files",
    preferredProvider: "cloudflare",
    remoteStateRequired: true,
    userConfirmationRequired: true,
    localManifestIsNotRemoteTruth: true,
    handoffPath: ".ganhuo/deployment-handoff.json",
  };
}

async function writeWorkspaceIndex(workspaceRoot, { siteName, siteDir, title }) {
  const indexDir = join(workspaceRoot, ".ganhuo");
  const indexPath = join(indexDir, "landerpilot-sites.json");
  mkdirSync(indexDir, { recursive: true });

  const release = await acquireIndexLock(indexDir);
  try {
    const current = readWorkspaceIndex(indexPath);
    const now = new Date().toISOString();
    const relativePath = relative(workspaceRoot, siteDir) || ".";
    const sites = Array.isArray(current.sites) ? current.sites : [];
    const existingIndex = sites.findIndex((site) => site && site.path === relativePath);
    const previous = existingIndex >= 0 ? sites[existingIndex] : {};
    const nextSite = {
      id: siteName,
      title,
      path: relativePath,
      framework: "astro",
      template: "bare",
      createdAt: typeof previous.createdAt === "string" ? previous.createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      sites[existingIndex] = nextSite;
    } else {
      sites.push(nextSite);
    }

    const next = {
      kind: "landerpilot-workspace",
      version: 1,
      sites: sites.sort((a, b) => String(a.path).localeCompare(String(b.path))),
    };
    writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  } finally {
    release();
  }
}

function readWorkspaceIndex(indexPath) {
  if (!existsSync(indexPath)) return {};
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return {};
  }
}

async function acquireIndexLock(indexDir) {
  const lockDir = join(indexDir, "landerpilot-sites.lock");
  const deadline = Date.now() + 10_000;
  const staleAfterMs = 30_000;
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      return () => rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) {
        throw error;
      }
      if (isStaleLock(lockDir, staleAfterMs)) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      await sleep(50);
    }
  }
  throw new Error("Timed out waiting for LanderPilot workspace index lock.");
}

function isStaleLock(lockDir, staleAfterMs) {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
