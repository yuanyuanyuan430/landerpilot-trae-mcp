#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(skillRoot, "..", "..");
const blueprintRoot = join(pluginRoot, "blueprints");

try {
  const { command, args } = parseCli(process.argv.slice(2));
  const workspaceRoot = resolve(args.workspace || process.cwd());
  const result = runCommand(command, args, workspaceRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function runCommand(command, args, workspaceRoot) {
  switch (command) {
    case "list-sites":
      return listWorkspaceSites(workspaceRoot, args.scan !== "false");
    case "inspect-site":
      return inspectSiteProject(workspaceRoot, args.site || args.site_path);
    case "list-template-slots":
      return listTemplateSlots();
    case "prepare-deployment-handoff":
      return prepareDeploymentHandoff(workspaceRoot, {
        site_path: requireArg(args.site || args.site_path, "Missing --site."),
        operation: args.operation || "unknown",
        domain: args.domain,
        remote_project_hint: args.remoteProjectHint || args.remote_project_hint,
        notes: args.notes,
        write_file: args.write !== "false",
      });
    default:
      usage();
      throw new Error(`Unknown LanderPilot local tool: ${command || "<empty>"}`);
  }
}

function parseCli(argv) {
  const command = argv[0] || "";
  const args = {};
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[toCamelKey(key)] = "true";
      continue;
    }
    args[toCamelKey(key)] = next;
    index += 1;
  }
  if (args.noScan === "true") args.scan = "false";
  if (args.noWrite === "true") args.write = "false";
  return { command, args };
}

function toCamelKey(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/local-tools.mjs list-sites [--workspace <path>] [--no-scan]",
      "  node scripts/local-tools.mjs inspect-site --workspace <path> --site <site-path>",
      "  node scripts/local-tools.mjs list-template-slots",
      "  node scripts/local-tools.mjs prepare-deployment-handoff --workspace <path> --site <site-path> [--operation new_deploy|update_existing|rollback|unknown] [--domain <domain>] [--remote-project-hint <name>] [--notes <text>] [--no-write]",
    ].join("\n")
  );
}

function requireArg(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function listTemplateSlots() {
  return {
    entrySkill: "landerpilot",
    model: "single-skill-workflow-with-internal-blueprints",
    languageSupport: defaultLanguageSupport(),
    scaffold: {
      id: "bare",
      status: "scaffold-only",
      selectable: false,
      description:
        "Minimal Astro scaffold created by create-site.mjs before a blueprint is selected. It is not a generate-site --type value.",
    },
    templates: listBlueprints(),
    cloudMcp: {
      package: "landerpilot",
      serverName: "landerpilot",
      status: "available-when-user-connects",
      role: "把本地构建好的站点部署到 Cloudflare Pages / Worker，供给 D1/R2 资源、staging 产物、绑定域名、查询部署状态。",
      tools: [
        "inspect_project",
        "create_or_update_site_project",
        "prepare_artifact_upload",
        "complete_artifact_upload",
        "deploy_site",
        "get_deployment_status",
        "provision_site_resource",
        "run_site_d1",
        "upload_site_asset",
        "bind_site_domain",
        "rollback_deployment",
      ],
    },
  };
}

function listBlueprints() {
  const templates = [];
  if (!existsSync(blueprintRoot)) return templates;
  for (const entry of readdirSync(blueprintRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const status = readJsonStatus(join(blueprintRoot, entry.name, "blueprint.json"));
    if (!status.exists || !("data" in status) || !isRecord(status.data)) continue;
    templates.push({
      id: typeof status.data.id === "string" ? status.data.id : entry.name,
      displayName: typeof status.data.displayName === "string" ? status.data.displayName : entry.name,
      status: typeof status.data.status === "string" ? status.data.status : "available",
      description: typeof status.data.description === "string" ? status.data.description : "",
      routes: Array.isArray(status.data.routes) ? status.data.routes : [],
      languageSupport: isRecord(status.data.languageSupport)
        ? status.data.languageSupport
        : defaultLanguageSupport(),
      inputModel: isRecord(status.data.inputModel) ? status.data.inputModel : null,
      dataPolicy: isRecord(status.data.dataPolicy) ? status.data.dataPolicy : null,
      variants: Array.isArray(status.data.variants) ? status.data.variants : [],
      templates: Array.isArray(status.data.templates) ? status.data.templates : [],
      examples: Array.isArray(status.data.examples) ? status.data.examples : [],
      theme: isRecord(status.data.theme) ? status.data.theme : null,
      entrySkill: "landerpilot",
    });
  }
  return templates.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function defaultLanguageSupport() {
  return {
    default: "en",
    stable: ["en"],
    mvp: ["zh-CN"],
    notes:
      "zh-CN is best-effort for built-in template copy; Agent-authored pages must handle Astro i18n explicitly.",
  };
}

function listWorkspaceSites(workspaceRoot, includeScan) {
  const root = resolve(workspaceRoot);
  const indexPath = join(root, ".ganhuo", "landerpilot-sites.json");
  const index = readJsonStatus(indexPath);
  const byPath = new Map();

  if (index.exists && "data" in index && isRecord(index.data)) {
    const sites = Array.isArray(index.data.sites) ? index.data.sites : [];
    for (const site of sites) {
      if (!isRecord(site) || typeof site.path !== "string") continue;
      const summary = summarizeSite(root, site.path, "index");
      byPath.set(summary.path, {
        ...summary,
        id: typeof site.id === "string" ? site.id : summary.id,
        title: typeof site.title === "string" ? site.title : summary.title,
        template: typeof site.template === "string" ? site.template : summary.template,
        createdAt: typeof site.createdAt === "string" ? site.createdAt : null,
        updatedAt: typeof site.updatedAt === "string" ? site.updatedAt : null,
      });
    }
  }

  if (includeScan) {
    for (const summary of scanWorkspaceSites(root)) {
      const existing = byPath.get(summary.path);
      byPath.set(summary.path, existing ? { ...summary, ...existing } : summary);
    }
  }

  return {
    workspaceRoot: root,
    index,
    sites: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function inspectSiteProject(workspaceRoot, sitePath) {
  const siteRoot = resolveSiteRoot(workspaceRoot, sitePath);
  const packageJson = readJsonStatus(join(siteRoot, "package.json"));
  const publicManifest = readJsonStatus(join(siteRoot, "public", ".ganhuo", "site.json"));
  const distManifest = readJsonStatus(join(siteRoot, "dist", ".ganhuo", "site.json"));
  const previewState = readJsonStatus(join(siteRoot, ".ganhuo", "preview-server.json"));
  const deploymentHandoff = readJsonStatus(join(siteRoot, ".ganhuo", "deployment-handoff.json"));

  return {
    siteRoot,
    relativeSiteRoot: relative(resolve(workspaceRoot), siteRoot) || ".",
    exists: existsSync(siteRoot),
    packageJson: summarizePackageJson(packageJson),
    astro: {
      configExists: existsSync(join(siteRoot, "astro.config.mjs")),
      pages: listAstroPages(join(siteRoot, "src", "pages")),
    },
    manifest: {
      public: publicManifest,
      dist: distManifest,
    },
    build: {
      distExists: existsSync(join(siteRoot, "dist")),
      indexHtmlExists: existsSync(join(siteRoot, "dist", "index.html")),
    },
    preview: summarizePreviewState(previewState),
    deployment: {
      handoff: deploymentHandoff,
      safety: deploymentSafetyContract(),
    },
  };
}

function prepareDeploymentHandoff(workspaceRoot, args) {
  const siteRoot = resolveSiteRoot(workspaceRoot, args.site_path);
  const packageJson = readJsonStatus(join(siteRoot, "package.json"));
  const publicManifest = readJsonStatus(join(siteRoot, "public", ".ganhuo", "site.json"));
  const distManifest = readJsonStatus(join(siteRoot, "dist", ".ganhuo", "site.json"));
  const sitePlan = readJsonStatus(join(siteRoot, ".ganhuo", "site-plan.json"));
  const sourceInput = readJsonStatus(join(siteRoot, ".ganhuo", "landerpilot-input.json"));
  const distRoot = join(siteRoot, "dist");
  const dist = summarizeDist(distRoot);
  const operation = args.operation ?? "unknown";
  const now = new Date().toISOString();
  const handoff = {
    kind: "landerpilot-deployment-handoff",
    version: 1,
    generatedAt: now,
    workspaceRoot: resolve(workspaceRoot),
    siteRoot,
    relativeSiteRoot: relative(resolve(workspaceRoot), siteRoot) || ".",
    localSite: {
      packageJson: summarizePackageJson(packageJson),
      publicManifest,
      distManifest,
      sitePlan,
      sourceInput,
      build: {
        ready: dist.indexHtmlExists && dist.fileCount > 0,
        outputDir: "dist",
        ...dist,
      },
    },
    intent: {
      operation,
      domain: args.domain ?? null,
      remoteProjectHint: args.remote_project_hint ?? null,
      notes: args.notes ?? null,
    },
    safety: deploymentSafetyContract(),
    nextRequiredCloudMcpSteps: [
      {
        step: "inspect_project",
        required: true,
        description:
          "用 LanderPilot 云端 MCP inspect_project 查询当前 SaaS / Cloudflare 项目、部署和资源绑定状态，不能只信本地配置或历史记忆。",
      },
      {
        step: "create_or_update_site_project",
        required: true,
        description:
          "用 create_or_update_site_project 登记/更新云端站点项目，明确 deploySurface（pages 或 worker）、framework、locale，并拿到云端 siteId。",
      },
      {
        step: "stage_artifact",
        required: true,
        description:
          "用 prepare_artifact_upload 取得上传地址，PUT dist 压缩包后用 complete_artifact_upload 校验指纹；云端不直接读本地文件。",
      },
      {
        step: "user_confirmation",
        required: true,
        description:
          "调用 deploy_site / provision_site_resource / run_site_d1 / bind_site_domain / rollback_deployment 等线上写操作前必须让用户明确确认；既有线上资源改动必须点名目标 project / domain / deployment ID。",
      },
      {
        step: "deploy_and_verify",
        required: true,
        description:
          "用户确认后调用 deploy_site，再用 get_deployment_status 跟踪结果；需要自定义域名时调用 bind_site_domain。",
      },
    ],
  };

  if (args.write_file !== false) {
    const outDir = join(siteRoot, ".ganhuo");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "deployment-handoff.json"), `${JSON.stringify(handoff, null, 2)}\n`);
  }

  return {
    ...handoff,
    written: args.write_file !== false ? join(siteRoot, ".ganhuo", "deployment-handoff.json") : null,
  };
}

function scanWorkspaceSites(workspaceRoot) {
  if (!existsSync(workspaceRoot)) return [];
  const out = [];
  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const relPath = entry.name;
    const siteRoot = join(workspaceRoot, relPath);
    if (looksLikeLanderPilotSite(siteRoot)) {
      out.push(summarizeSite(workspaceRoot, relPath, "scan"));
    }
  }
  if (looksLikeLanderPilotSite(workspaceRoot)) {
    out.push(summarizeSite(workspaceRoot, ".", "scan"));
  }
  return out;
}

function summarizeSite(workspaceRoot, relPath, source) {
  const siteRoot = resolve(workspaceRoot, relPath);
  const publicManifest = readJsonStatus(join(siteRoot, "public", ".ganhuo", "site.json"));
  const manifestData =
    publicManifest.exists && "data" in publicManifest && isRecord(publicManifest.data)
      ? publicManifest.data
      : {};
  return {
    id: relPath === "." ? "root" : relPath.replace(/[\\/]/g, "-"),
    path: relative(resolve(workspaceRoot), siteRoot) || ".",
    source,
    title: typeof manifestData.title === "string" ? manifestData.title : null,
    framework: typeof manifestData.framework === "string" ? manifestData.framework : null,
    template: typeof manifestData.template === "string" ? manifestData.template : null,
    packageJsonExists: existsSync(join(siteRoot, "package.json")),
    astroConfigExists: existsSync(join(siteRoot, "astro.config.mjs")),
    distIndexExists: existsSync(join(siteRoot, "dist", "index.html")),
    previewRecorded: existsSync(join(siteRoot, ".ganhuo", "preview-server.json")),
  };
}

function looksLikeLanderPilotSite(siteRoot) {
  if (!existsSync(siteRoot)) return false;
  const manifest = readJsonStatus(join(siteRoot, "public", ".ganhuo", "site.json"));
  if (!manifest.exists || !("data" in manifest) || !isRecord(manifest.data)) return false;
  return manifest.data.createdBy === "landerpilot" && manifest.data.framework === "astro";
}

function resolveSiteRoot(workspaceRoot, sitePath) {
  const root = resolve(workspaceRoot);
  const candidate = sitePath ? resolve(isAbsolute(sitePath) ? sitePath : join(root, sitePath)) : root;
  if (!isPathAtOrInside(candidate, root)) {
    throw new Error("site must stay inside the current workspace.");
  }
  return candidate;
}

function readJsonStatus(filePath) {
  if (!existsSync(filePath)) return { exists: false, path: filePath };
  try {
    return {
      exists: true,
      path: filePath,
      data: JSON.parse(readFileSync(filePath, "utf8")),
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizePackageJson(status) {
  if (!status.exists || !("data" in status)) return status;
  const data = status.data;
  return {
    exists: true,
    path: status.path,
    name: typeof data.name === "string" ? data.name : null,
    version: typeof data.version === "string" ? data.version : null,
    scripts: isRecord(data.scripts) ? Object.keys(data.scripts).sort() : [],
    dependencies: isRecord(data.dependencies) ? Object.keys(data.dependencies).sort() : [],
  };
}

function summarizePreviewState(status) {
  if (!status.exists || !("data" in status)) return status;
  const data = status.data;
  const pid = typeof data.pid === "number" ? data.pid : null;
  return {
    exists: true,
    path: status.path,
    manager: typeof data.manager === "string" ? data.manager : null,
    url: typeof data.url === "string" ? data.url : null,
    pid,
    pidAlive: pid ? isPidAlive(pid) : false,
    startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
    heartbeatAt: typeof data.heartbeatAt === "string" ? data.heartbeatAt : null,
    heartbeatAgeSeconds:
      typeof data.heartbeatAt === "string"
        ? Math.max(0, Math.round((Date.now() - Date.parse(data.heartbeatAt)) / 1000))
        : null,
    nodePath: typeof data.nodePath === "string" ? data.nodePath : null,
    logPath: typeof data.logPath === "string" ? data.logPath : null,
  };
}

function summarizeDist(distRoot) {
  if (!existsSync(distRoot)) {
    return {
      distExists: false,
      indexHtmlExists: false,
      fileCount: 0,
      totalBytes: 0,
      fingerprint: null,
      files: [],
    };
  }
  const files = [];
  walkDist(distRoot, "");
  files.sort((a, b) => a.path.localeCompare(b.path));

  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.bytes;
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.bytes));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }

  return {
    distExists: true,
    indexHtmlExists: existsSync(join(distRoot, "index.html")),
    fileCount: files.length,
    totalBytes,
    fingerprint: files.length > 0 ? `sha256:${hash.digest("hex")}` : null,
    files: files.slice(0, 200),
  };

  function walkDist(absDir, relDir) {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const relPath = relDir ? join(relDir, entry.name) : entry.name;
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walkDist(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const normalizedRel = relPath.replaceAll("\\", "/");
      const bytes = statSync(absPath).size;
      const fileHash = createHash("sha256").update(readFileSync(absPath)).digest("hex");
      files.push({ path: normalizedRel, bytes, sha256: fileHash });
    }
  }
}

function deploymentSafetyContract() {
  return {
    localPluginRole:
      "生成、构建、预览静态站点并准备部署交接包；不直接修改线上资源。",
    cloudMcpRole:
      "查询线上事实、staging 构建产物、供给 Cloudflare 资源，并在用户确认后部署到 Pages/Worker、绑定域名。",
    mustQueryRemoteBeforeEveryOnlineMutation: true,
    mustNotTrustLocalConfigAsRemoteTruth: true,
    userConfirmationRequiredFor: [
      "创建或更新 Cloudflare Pages/Worker 部署（deploy_site）",
      "供给 D1/R2/KV 等线上资源（provision_site_resource）",
      "对 D1 数据库执行 SQL（run_site_d1）",
      "绑定自定义域名或修改 DNS（bind_site_domain）",
      "覆盖已有 production deployment",
      "回滚线上部署（rollback_deployment）",
    ],
    existingResourceRule:
      "只要线上目标已存在，确认文案必须点名当前线上 project/worker/pages 名称、domain、deploymentId、updatedAt、将被替换的资源，以及 rollback 方案；没有这些信息不能继续。",
    staleStateRule:
      "确认前的线上状态必须来自当前回合的 inspect_project 查询；如果线上状态在确认后发生变化，必须重新 inspect_project 并重新确认。",
    ambiguityRule:
      "如果本地 siteId/domain 和线上 project/domain 无法唯一匹配，必须停止并让用户选择目标，不能猜。",
  };
}

function listAstroPages(pagesDir) {
  if (!existsSync(pagesDir)) return [];
  const out = [];
  walk(pagesDir, "");
  return out.sort();

  function walk(absDir, relDir) {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const relPath = relDir ? join(relDir, entry.name) : entry.name;
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith(".astro")) {
        out.push(relPath);
      }
    }
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPathAtOrInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}
