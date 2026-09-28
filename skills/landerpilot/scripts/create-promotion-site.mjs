#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { produce } from "../../../blueprints/promotion/producer.mjs";
import { npmCommand } from "../../../generators/shared/npm-command.mjs";
import {
  assertPartnerWhizArtifact,
  canonicalPartnerWhizInput,
  parsePartnerWhizToken,
  partnerWhizTokenFromInput,
} from "../../../generators/shared/partnerwhiz-verification.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pages = ["index.html", "guide/index.html", "about/index.html", "disclosure/index.html"];
const dataKeys = new Set(["partnerWhizVerificationToken", "partnerwhiz_verification", "site_name", "language", "type"]);

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node create-promotion-site.mjs (--verification-file <UTF-8-file> | --data <JSON-file> | --without-verification) [--workspace <path>] [--name <directory-name>] [--language zh-CN|en] [--no-build]");
    console.log("JSON fields: partnerWhizVerificationToken (or partnerwhiz_verification), site_name, language. Both input files may be supplied if their tokens agree.");
    console.log("Use --without-verification to create a site before obtaining a PartnerWhiz code. It may accompany --data for site name/language, but cannot accompany verification inputs.");
    console.log("Default: scaffold, generate, npm ci, npm run build, prepare local deployment handoff. --no-build skips install/build; nothing is published.");
    return;
  }
  const data = args.data ? JSON.parse(readUtf8(args.data)) : {};
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("--data must contain a JSON object.");
  if (Object.keys(data).some((key) => !dataKeys.has(key)) || (data.type !== undefined && data.type !== "promotion")) {
    throw new Error("Unsupported promotion input field. Use verification, site_name and language fields only.");
  }
  if (args["without-verification"] && (args["verification-file"] || ["partnerWhizVerificationToken", "partnerwhiz_verification"].some((key) => Object.hasOwn(data, key)))) {
    throw new Error("--without-verification cannot be combined with verification inputs.");
  }
  const fileToken = args["verification-file"] ? parsePartnerWhizToken(readUtf8(args["verification-file"])) : null;
  const dataToken = partnerWhizTokenFromInput(data);
  if (fileToken && dataToken && fileToken !== dataToken) throw new Error("Conflicting PartnerWhiz verification inputs.");
  const token = fileToken || dataToken;
  if (!token && !args["without-verification"]) {
    throw new Error("Provide --verification-file or a --data JSON file containing PartnerWhiz verification, or explicitly choose --without-verification.");
  }

  const input = canonicalPartnerWhizInput({ ...data, language: args.language ?? data.language ?? "zh-CN", type: "promotion" }, token);
  // Preflight all user-controlled values before creating a workspace, scaffold,
  // private input or index. Invalid input has no filesystem side effects.
  const result = await produce({ input });
  input.site_name = result.title;
  const workspace = resolve(args.workspace || process.cwd());
  const siteName = args.name || `shopping-guide-${randomUUID().slice(0, 8)}`;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(siteName)) {
    throw new Error("--name must use lowercase letters, numbers and hyphens, with no leading or trailing hyphen (max 64 characters).");
  }
  const siteDir = join(workspace, siteName);
  mkdirSync(workspace, { recursive: true });
  try {
    // Atomic reservation rejects files, symlinks and even empty directories.
    // create-site accepts this newly reserved empty directory.
    mkdirSync(siteDir);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Refusing to overwrite an existing path: ${siteDir}`);
    throw error;
  }
  console.log(`site=${siteDir}`);
  try {
    run(process.execPath, [join(scriptsDir, "create-site.mjs"), "--workspace", workspace, "--name", siteName, "--title", result.title], workspace);
    const privateDir = join(siteDir, ".ganhuo");
    mkdirSync(privateDir, { recursive: true, mode: 0o700 });
    const inputPath = join(privateDir, "landerpilot-input.json");
    writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    run(process.execPath, [join(scriptsDir, "generate-site.mjs"), "--site", siteDir, "--type", "promotion", "--data", inputPath], workspace);

    if (!args["no-build"]) {
      const npm = npmCommand();
      run(npm.command, [...npm.args, "ci", "--no-audit", "--no-fund"], siteDir);
      run(npm.command, [...npm.args, "run", "build"], siteDir);
      // Check the actual artifact, not just a successful build process exit.
      for (const page of pages) {
        const html = readFileSync(join(siteDir, "dist", page), "utf8");
        assertPartnerWhizArtifact(html, token, page);
      }
    }
    run(process.execPath, [join(scriptsDir, "local-tools.mjs"), "prepare-deployment-handoff", "--workspace", workspace, "--site", siteName, "--operation", "new_deploy"], workspace, true);
    console.log(`input=${inputPath}`);
    console.log(`build=${args["no-build"] ? "skipped" : "ready"}`);
    console.log(`verification=${token ? "configured" : "not-configured"}`);
    console.log(`handoff=${join(privateDir, "deployment-handoff.json")}`);
    console.log("published=false");
    console.log("partnerwhizApproval=not-checked");
  } catch (error) {
    throw new Error(`${error.message}\nSite files retained at ${siteDir}; fix the reported problem before building or publishing.`, { cause: error });
  }
}

function readUtf8(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes.length > 65_536) throw new Error("Promotion input exceeds 64 KiB.");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseArgs(argv) {
  const args = {};
  const flags = new Set(["help", "no-build", "without-verification"]);
  const values = new Set(["verification-file", "data", "workspace", "name", "language"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = argument.startsWith("--") ? argument.slice(2) : "";
    if ((!flags.has(key) && !values.has(key)) || Object.hasOwn(args, key)) {
      throw new Error(`Unknown or repeated option: ${argument}`);
    }
    if (flags.has(key)) { args[key] = true; continue; }
    const value = argv[++index];
    if (!value?.trim() || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
  }
  return args;
}

function run(command, args, cwd, quiet = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? result.signal}).${quiet ? `\n${result.stderr}` : ""}`);
}
