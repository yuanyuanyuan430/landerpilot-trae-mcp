import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertSecretTargetsAllowed,
  assertStableInstallPath,
  checkTargetConfig,
  cloudProxyPath,
  makeServerConfig,
  parseJsonc,
  resolveTargets,
  validateServerName,
  writeTargetConfig,
} from "../scripts/shared/agent-config.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const setupAgentPath = join(packageRoot, "scripts", "setup-agent.mjs");

test("Trae defaults to global targets and treats an explicit override as custom", () => {
  const defaultTargets = resolveTargets({
    argv: ["--client", "trae"],
    cwd: tmpdir(),
    platform: "darwin",
    invocationName: "landerpilot-mcp-setup",
  });
  assert.ok(defaultTargets.length >= 1);
  assert.ok(defaultTargets.every((target) => target.secretScope === "global"));

  const targetPath = join(tmpdir(), "trae-global-test.json");
  const overrideTargets = resolveTargets({
    argv: ["--client", "trae"],
    cwd: tmpdir(),
    platform: "linux",
    invocationName: "landerpilot-mcp-setup",
    globalConfigPath: targetPath,
  });

  assert.deepEqual(
    overrideTargets.map(({ path, secretScope }) => ({ path, secretScope })),
    [{ path: targetPath, secretScope: "custom" }]
  );
  assert.throws(
    () => assertSecretTargetsAllowed(overrideTargets, false),
    /--allow-project-secret/
  );
});

test("Codex defaults global while an explicit project target remains protected", () => {
  const globalTargets = resolveTargets({
    argv: ["--client", "codex"],
    cwd: tmpdir(),
    platform: process.platform,
    invocationName: "landerpilot-mcp-setup",
  });
  assert.equal(globalTargets.length, 1);
  assert.equal(globalTargets[0].secretScope, "global");

  const projectTargets = resolveTargets({
    argv: ["--client", "codex", "--scope", "project"],
    cwd: tmpdir(),
    platform: process.platform,
    invocationName: "landerpilot-mcp-setup",
  });
  assert.equal(projectTargets[0].secretScope, "project");
  assert.throws(
    () => assertSecretTargetsAllowed(projectTargets, false),
    /--allow-project-secret/
  );
});

test("Codex doctor only accepts values inside its managed server block", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-codex-doctor-"));
  const target = {
    client: "codex",
    label: "Codex",
    path: join(root, "config.toml"),
    format: "codex-toml",
    secretScope: "global",
    trustRoot: root,
  };

  try {
    const server = makeServerConfig({
      apiKey: "lp_test_codex",
    });
    writeTargetConfig(target, "landerpilot", server);
    assert.equal(checkTargetConfig(target, "landerpilot").ok, true);

    const brokenManagedBlock = readFileSync(target.path, "utf8")
      .replace(`LANDERPILOT_API_KEY = "lp_test_codex"`, 'BROKEN_KEY = "lp_test_codex"')
      .replace(JSON.stringify(cloudProxyPath), '"/tmp/not-landerpilot.mjs"');
    writeFileSync(
      target.path,
      `${brokenManagedBlock}
[mcp_servers.other]
command = ${JSON.stringify(process.execPath)}
args = [${JSON.stringify(cloudProxyPath)}]

[mcp_servers.other.env]
LANDERPILOT_API_KEY = "lp_other"
`
    );

    assert.equal(checkTargetConfig(target, "landerpilot").ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every explicit global config override requires secret confirmation", () => {
  for (const client of [
    "trae",
    "cursor",
    "claude-desktop",
    "codex",
    "codewhale",
    "opencode",
  ]) {
    const targets = resolveTargets({
      argv: ["--client", client],
      cwd: tmpdir(),
      platform: "darwin",
      invocationName: "landerpilot-mcp-setup",
      globalConfigPath: join(tmpdir(), `${client}.config`),
    });
    assert.ok(targets.length >= 1, client);
    assert.ok(targets.every((target) => target.secretScope === "custom"), client);
    assert.throws(
      () => assertSecretTargetsAllowed(targets, false),
      /--allow-project-secret/,
      client
    );
  }
});

test("HOME and XDG defaults inside a Git worktree require secret confirmation", () => {
  const repo = mkdtempSync(join(tmpdir(), "landerpilot-home-repo-"));
  const runner = mkdtempSync(join(tmpdir(), "landerpilot-home-runner-"));
  mkdirSync(join(repo, ".git"));

  try {
    for (const scenario of [
      {
        client: "codex",
        extraArgs: [],
        env: { HOME: repo },
      },
      {
        client: "opencode",
        extraArgs: [],
        env: { HOME: repo },
      },
      {
        client: "trae",
        extraArgs: ["--platform", "linux"],
        env: { HOME: runner, XDG_CONFIG_HOME: repo },
      },
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          setupAgentPath,
          "--client",
          scenario.client,
          ...scenario.extraArgs,
        ],
        {
          cwd: runner,
          encoding: "utf8",
          env: {
            ...process.env,
            ...scenario.env,
            LANDERPILOT_SETUP_API_KEY: "lp_test_home_repo",
          },
        }
      );
      assert.equal(result.status, 1, `${scenario.client}\n${result.stderr}`);
      assert.match(result.stderr, /--allow-project-secret/, scenario.client);
    }

    assert.equal(existsSync(join(repo, ".codex", "config.toml")), false);
    assert.equal(existsSync(join(repo, "opencode", "opencode.json")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(runner, { recursive: true, force: true });
  }
});

test("a non-Git directory cannot impersonate the account home", () => {
  const home = mkdtempSync(join(tmpdir(), "landerpilot-normal-home-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        setupAgentPath,
        "--client",
        "cursor",
      ],
      {
        cwd: home,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          LANDERPILOT_SETUP_API_KEY: "lp_test_normal_home",
        },
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /--allow-project-secret/);
    assert.equal(existsSync(join(home, ".cursor", "mcp.json")), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the real account home remains a trusted global target", () => {
  const targets = resolveTargets({
    argv: ["--client", "cursor"],
    cwd: userInfo().homedir,
    platform: process.platform,
    invocationName: "landerpilot-mcp-setup",
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].secretScope, "global");
});

test("custom remote URLs require explicit trust and never allow non-loopback HTTP", () => {
  const official = makeServerConfig({ apiKey: "lp_test_official" });
  assert.equal(
    official.env.LANDERPILOT_MCP_URL,
    "https://landerpilot.com/api/mcp"
  );

  assert.throws(
    () =>
      makeServerConfig({
        apiKey: "lp_test_custom",
        remoteUrl: "https://mcp.example.com/api",
      }),
    /--allow-custom-url/
  );

  const custom = makeServerConfig({
    apiKey: "lp_test_custom",
    remoteUrl: "https://mcp.example.com/api",
    allowCustomUrl: true,
  });
  assert.equal(custom.env.LANDERPILOT_ALLOW_CUSTOM_MCP_URL, "1");

  assert.throws(
    () =>
      makeServerConfig({
        apiKey: "lp_test_http",
        remoteUrl: "http://mcp.example.com/api",
        allowCustomUrl: true,
      }),
    /HTTPS/
  );
});

test("setup refuses project secrets by default and allows the explicit risk flag", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-secret-policy-"));
  try {
    const args = [
      "scripts/setup-agent.mjs",
      "--client",
      "generic",
      "--project",
      root,
    ];
    const env = { ...process.env, LANDERPILOT_SETUP_API_KEY: "lp_test_secret" };
    const refused = spawnSync(process.execPath, args, { encoding: "utf8", env });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--allow-project-secret/);

    const allowed = spawnSync(process.execPath, [...args, "--allow-project-secret"], {
      encoding: "utf8",
      env,
    });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(statSync(join(root, ".mcp.json")).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("setup rejects API Keys in process arguments", () => {
  const result = spawnSync(
    process.execPath,
    [setupAgentPath, "--api-key", "lp_should_not_be_in_argv"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /进程列表或 shell 历史/);
  assert.doesNotMatch(result.stderr, /lp_should_not_be_in_argv/);
});

test("custom and project targets require explicit secret approval", () => {
  const targets = [
    { path: "/tmp/project.json", secretScope: "project" },
    { path: "/tmp/custom.json", secretScope: "custom" },
  ];
  assert.throws(() => assertSecretTargetsAllowed(targets, false), /--allow-project-secret/);
  assert.doesNotThrow(() => assertSecretTargetsAllowed(targets, true));
});

test("ephemeral package paths are rejected before config generation", () => {
  assert.throws(
    () => assertStableInstallPath("/home/user/.npm/_npx/abc/node_modules/landerpilot-mcp/cloud-proxy.mjs"),
    /npm install -g landerpilot-mcp/
  );
  assert.doesNotThrow(() =>
    assertStableInstallPath("/usr/local/lib/node_modules/landerpilot-mcp/cloud-proxy.mjs")
  );
});

test("server names reject config injection characters", () => {
  assert.equal(validateServerName("landerpilot_02-prod"), "landerpilot_02-prod");
  for (const value of ["", "bad.name", "bad\n[mcp_servers.pwned]", "a".repeat(65)]) {
    assert.throws(() => validateServerName(value), /1–64/);
  }
});

test("OpenCode reuses JSONC, merges safely, and remains idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-opencode-jsonc-"));
  const configPath = join(root, "opencode.jsonc");
  try {
    writeFileSync(
      configPath,
      `{
  // Comments and trailing commas are valid JSONC.
  "docs": "https://example.com/a//b",
  "literal": "/* keep this string */",
  "mcp": {
    "existing": {
      "type": "local",
      "command": ["node", "existing.mjs"],
    },
  },
}
`
    );
    const [target] = resolveTargets({
      argv: ["--client", "opencode", "--scope", "project"],
      cwd: root,
      platform: process.platform,
      invocationName: "landerpilot-opencode-setup",
    });
    assert.equal(target.path, configPath);

    const server = makeServerConfig({
      apiKey: "lp_test_opencode",
    });
    writeTargetConfig(target, "landerpilot", server);
    writeTargetConfig(target, "landerpilot", server);

    const updatedText = readFileSync(configPath, "utf8");
    const parsed = parseJsonc(updatedText);
    assert.equal(parsed.docs, "https://example.com/a//b");
    assert.equal(parsed.literal, "/* keep this string */");
    assert.deepEqual(Object.keys(parsed.mcp).sort(), ["existing", "landerpilot"]);
    assert.deepEqual(parsed.mcp.landerpilot.command, [process.execPath, server.args[0]]);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.match(updatedText, /Comments and trailing commas are valid JSONC/);
    assert.match(updatedText, /"existing"[\s\S]*},\s*\n\s*"landerpilot"/);

    const backups = readdirSync(root).filter((name) => name.startsWith("opencode.jsonc.bak-"));
    assert.deepEqual(backups, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("quoted Codex server tables are rejected without changing the file", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-codex-quoted-"));
  const configPath = join(root, "config.toml");
  const target = {
    client: "codex",
    label: "Codex",
    path: configPath,
    format: "codex-toml",
    secretScope: "global",
    trustRoot: root,
  };

  try {
    const server = makeServerConfig({ apiKey: "lp_test_quoted" });
    for (const table of [
      '[mcp_servers."landerpilot"]',
      '["mcp_servers"."landerpilot"]',
      "['mcp_servers'.landerpilot]",
    ]) {
      const original = `${table}
command = "node"
args = ["existing.mjs"]
`;
      writeFileSync(configPath, original);
      assert.throws(
        () => writeTargetConfig(target, "landerpilot", server),
        /未标记/,
        table
      );
      assert.equal(readFileSync(configPath, "utf8"), original, table);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("config writes reject a symlink target", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-config-symlink-"));
  const realPath = join(root, "real.json");
  const linkedPath = join(root, "linked.json");
  const original = '{"keep":true}\n';
  try {
    writeFileSync(realPath, original);
    symlinkSync(realPath, linkedPath);
    const server = makeServerConfig({ apiKey: "lp_test_symlink" });
    assert.throws(
      () =>
        writeTargetConfig(
          {
            client: "generic",
            label: "Generic",
            path: linkedPath,
            format: "mcp-json",
            secretScope: "project",
            trustRoot: root,
          },
          "landerpilot",
          server
        ),
      /符号链接/
    );
    assert.equal(readFileSync(realPath, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("config writes reject a symlinked ancestor below the trusted root", () => {
  const root = mkdtempSync(join(tmpdir(), "landerpilot-config-root-"));
  const outside = mkdtempSync(join(tmpdir(), "landerpilot-config-outside-"));
  const linkedDirectory = join(root, "linked-directory");
  const redirectedPath = join(outside, "nested", "mcp.json");
  try {
    symlinkSync(outside, linkedDirectory, "dir");
    const server = makeServerConfig({ apiKey: "lp_test_ancestor_symlink" });
    assert.throws(
      () =>
        writeTargetConfig(
          {
            client: "generic",
            label: "Generic",
            path: join(linkedDirectory, "nested", "mcp.json"),
            format: "mcp-json",
            secretScope: "project",
            trustRoot: root,
          },
          "landerpilot",
          server
        ),
      /符号链接/
    );
    assert.equal(existsSync(redirectedPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("config writes reject a symlink used as the trusted root", () => {
  const base = mkdtempSync(join(tmpdir(), "landerpilot-trust-base-"));
  const outside = mkdtempSync(join(tmpdir(), "landerpilot-trust-outside-"));
  const linkedRoot = join(base, "linked-root");
  const redirectedPath = join(outside, "nested", "mcp.json");
  try {
    symlinkSync(outside, linkedRoot, "dir");
    const server = makeServerConfig({ apiKey: "lp_test_root_symlink" });
    assert.throws(
      () =>
        writeTargetConfig(
          {
            client: "generic",
            label: "Generic",
            path: join(linkedRoot, "nested", "mcp.json"),
            format: "mcp-json",
            secretScope: "project",
            trustRoot: linkedRoot,
          },
          "landerpilot",
          server
        ),
      /符号链接/
    );
    assert.equal(existsSync(redirectedPath), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("OpenCode global setup uses an existing opencode.jsonc without creating opencode.json", () => {
  const home = mkdtempSync(join(tmpdir(), "landerpilot-opencode-home-"));
  const configDir = join(home, ".config", "opencode");
  const jsoncPath = join(configDir, "opencode.jsonc");
  try {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(jsoncPath, '{\n  // existing\n  "mcp": {},\n}\n');
    const result = spawnSync(
      process.execPath,
      [
        "scripts/setup-agent.mjs",
        "--client",
        "opencode",
        "--allow-project-secret",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          LANDERPILOT_SETUP_API_KEY: "lp_test_global_jsonc",
        },
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(configDir, "opencode.json")), false);
    assert.equal(
      parseJsonc(readFileSync(jsoncPath, "utf8")).mcp.landerpilot.environment.LANDERPILOT_API_KEY,
      "lp_test_global_jsonc"
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
