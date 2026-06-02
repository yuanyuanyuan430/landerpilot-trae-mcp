#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeAstroSite } from "../../../generators/shared/write-astro-site.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(skillRoot, "..", "..");
const blueprintRoot = join(pluginRoot, "blueprints");

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const siteDir = resolve(requireArg(args.site, "Missing --site."));
  const type = normalizeType(args.type || args.blueprint || args.template || "corporate");
  const input = args.data ? readJson(resolve(args.data)) : {};
  const theme = args.theme ? readJson(resolve(args.theme)) : input.theme || {};

  assertSiteDir(siteDir);
  const producerPath = join(blueprintRoot, type, "producer.mjs");
  if (!existsSync(producerPath)) {
    throw new Error(`Unsupported LanderPilot blueprint: ${type}`);
  }

  const producer = await import(pathToFileURL(producerPath).href);
  if (typeof producer.produce !== "function") {
    throw new Error(`Blueprint is missing produce(): ${type}`);
  }
  const result = await producer.produce({ input, siteDir, pluginRoot, skillRoot });
  const written = writeAstroSite(siteDir, result, { input: { ...input, type }, theme });
  await updateWorkspaceIndex(siteDir, result, type);

  console.log(`LanderPilot generated ${result.blueprint} site: ${siteDir}`);
  console.log(`title=${result.title || ""}`);
  console.log(`variant=${result.variant || ""}`);
  console.log(`pages=${written.pages.length}`);
  if (result.summary && Array.isArray(result.summary.sections)) {
    console.log(`sections=${result.summary.sections.join(",")}`);
  }
  for (const key of ["featureCount", "pricingPlanCount", "processStepCount", "testimonialCount"]) {
    if (result.summary && result.summary[key] != null) {
      console.log(`${key}=${result.summary[key]}`);
    }
  }
  if (Array.isArray(result.warnings)) {
    for (const warning of result.warnings) {
      console.log(`warning=${warning}`);
    }
  }
  for (const page of written.pages) {
    console.log(`page=${page}`);
  }
  console.log(`manifest=${join(siteDir, "public", ".ganhuo", "site.json")}`);
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

function normalizeType(value) {
  const type = String(value || "").trim().toLowerCase();
  const aliases = {
    affiliate: "affiliate-review",
    review: "affiliate-review",
    "affiliate-brand-hub": "affiliate-review",
    "affiliate-review": "affiliate-review",
    corporate: "corporate",
    saas: "corporate",
    company: "corporate",
    cashback: "cashback",
    coupon: "cashback",
    coupons: "cashback",
  };
  const normalized = aliases[type] || type;
  const available = availableBlueprintTypes();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(normalized) || !available.includes(normalized)) {
    throw new Error(
      `Unsupported LanderPilot blueprint: ${normalized}. Available blueprints: ${available.join(", ")}`
    );
  }
  return normalized;
}

function availableBlueprintTypes() {
  return readdirSync(blueprintRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(blueprintRoot, name, "producer.mjs")))
    .sort();
}

function assertSiteDir(siteDir) {
  if (!existsSync(join(siteDir, "package.json")) || !existsSync(join(siteDir, "astro.config.mjs"))) {
    throw new Error(`Not a LanderPilot Astro site directory: ${siteDir}`);
  }
  if (!existsSync(join(siteDir, "scripts", "ganhuo-preview-server.mjs"))) {
    throw new Error(`Not a LanderPilot scaffold directory: ${siteDir}`);
  }
  const manifestPath = join(siteDir, "public", ".ganhuo", "site.json");
  const manifest = readOptionalJson(manifestPath);
  if (
    manifest.kind !== "static-site" ||
    manifest.framework !== "astro" ||
    manifest.createdBy !== "landerpilot"
  ) {
    throw new Error(
      `Refusing to generate into a non-LanderPilot site. Missing or invalid manifest: ${manifestPath}`
    );
  }
}

function requireArg(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON: ${path}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function readOptionalJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

async function updateWorkspaceIndex(siteDir, result, type) {
  const workspaceRoot = dirname(siteDir);
  const indexDir = join(workspaceRoot, ".ganhuo");
  const indexPath = join(indexDir, "landerpilot-sites.json");
  mkdirSync(indexDir, { recursive: true });

  const release = await acquireIndexLock(indexDir);
  try {
    const current = readOptionalJson(indexPath);
    const sites = Array.isArray(current.sites) ? current.sites : [];
    const relPath = relative(workspaceRoot, siteDir) || ".";
    const now = new Date().toISOString();
    const existingIndex = sites.findIndex((site) => site && site.path === relPath);
    const previous = existingIndex >= 0 ? sites[existingIndex] : {};
    const nextSite = {
      id: typeof previous.id === "string" ? previous.id : basename(siteDir),
      title: result.title || previous.title || basename(siteDir),
      path: relPath,
      framework: "astro",
      template: type,
      templateVariant: result.variant || previous.templateVariant || "default",
      createdAt: typeof previous.createdAt === "string" ? previous.createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) {
      sites[existingIndex] = nextSite;
    } else {
      sites.push(nextSite);
    }
    writeFileSync(
      indexPath,
      `${JSON.stringify(
        {
          kind: "landerpilot-workspace",
          version: 1,
          sites: sites.sort((a, b) => String(a.path).localeCompare(String(b.path))),
        },
        null,
        2
      )}\n`
    );
  } finally {
    release();
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
