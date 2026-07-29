#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const registry = packageJson.publishConfig?.registry || "https://registry.npmjs.org";
const cacheDir = mkdtempSync(join(tmpdir(), "landerpilot-mcp-publish-cache-"));

try {
  const packageSpec = `${packageJson.name}@${packageJson.version}`;
  const versionCheck = npm(["view", packageSpec, "version", "--registry", registry]);
  const versionCheckOutput = `${versionCheck.stdout}\n${versionCheck.stderr}`;
  const versionAvailable =
    versionCheck.status !== 0 &&
    /E404|404 Not Found|could not be found|No match found/i.test(versionCheckOutput);
  if (versionCheck.status !== 0 && !versionAvailable) {
    throw new Error(`Could not check ${packageSpec} on ${registry}:\n${versionCheckOutput}`);
  }
  if (versionCheck.status === 0) {
    throw new Error(`${packageSpec} already exists on ${registry}.`);
  }

  const authCheck = npm(["whoami", "--registry", registry]);
  const loggedIn = authCheck.status === 0;
  const publishDryRun = npm(["publish", "--dry-run", "--ignore-scripts"]);
  if (publishDryRun.status !== 0) {
    throw new Error(`npm publish --dry-run failed:\n${publishDryRun.stdout}\n${publishDryRun.stderr}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        package: packageSpec,
        registry,
        versionAvailable,
        publishedVersion: null,
        loggedIn,
        npmUser: loggedIn ? authCheck.stdout.trim() : null,
        canDryRunPublish: true,
        nextStep: loggedIn
          ? "Run npm run publish:npm to publish."
          : `Run npm adduser --registry ${registry}, then npm run publish:npm.`,
      },
      null,
      2
    )
  );

  if (!loggedIn) {
    process.exitCode = 2;
  }
} finally {
  rmSync(cacheDir, { force: true, recursive: true });
}

function npm(args) {
  return spawnSync("npm", args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    timeout: 180000,
  });
}
