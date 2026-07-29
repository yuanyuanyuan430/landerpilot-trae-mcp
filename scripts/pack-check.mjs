#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cacheDir = mkdtempSync(join(tmpdir(), "landerpilot-mcp-npm-cache-"));

try {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exitCode = result.status ?? 1;
  } else {
    const info = JSON.parse(result.stdout)[0];
    const paths = new Set(info.files.map((file) => file.path));
    const required = ["README.md", "llms.txt", "llms-full.txt"];
    const missing = required.filter((path) => !paths.has(path));
    if (missing.length > 0) {
      throw new Error(`Package is missing required files: ${missing.join(", ")}`);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          package: `${info.name}@${info.version}`,
          fileCount: info.files.length,
          requiredFiles: required,
        },
        null,
        2
      )
    );
  }
} finally {
  rmSync(cacheDir, { force: true, recursive: true });
}
