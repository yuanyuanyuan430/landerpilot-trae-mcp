import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const create = fileURLToPath(new URL("./create-promotion-site.mjs", import.meta.url));
const generate = fileURLToPath(new URL("./generate-site.mjs", import.meta.url));
const token = "pw_test-A_9";
const meta = `<meta name="partnerwhiz-verify" content="${token}">`;
const routes = ["index", "guide", "about", "disclosure"];

test("invalid file, JSON, language and directory input creates no workspace or artifacts", (t) => {
  const root = temporary(t);
  const workspace = join(root, "not-created");
  const codeFile = join(root, "verification.txt");
  const dataFile = join(root, "data.json");
  const invalidCode = ["", "pw_", meta + '<script>alert(1)</script>', meta + meta, '<meta name="other" content="pw_test">', '<meta name="partnerwhiz-verify" content="pw_test" onclick="evil()">', Buffer.from([0xc3, 0x28])];
  for (const code of invalidCode) {
    writeFileSync(codeFile, code);
    failure(run(create, ["--verification-file", codeFile, "--workspace", workspace, "--no-build"]));
    assert.equal(existsSync(workspace), false);
  }
  for (const data of [null, [], "pw_test", {}, { partnerWhizVerificationToken: "pw_" }, { partnerwhiz_verification: meta, partnerWhizVerificationToken: "pw_other" }, { partnerWhizVerificationToken: token, language: "de" }, { partnerWhizVerificationToken: token, site_name: "{process.env.HOME}" }, { partnerWhizVerificationToken: token, headHtml: "<script>evil()</script>" }]) {
    writeFileSync(dataFile, JSON.stringify(data));
    failure(run(create, ["--data", dataFile, "--workspace", workspace, "--no-build"]));
    assert.equal(existsSync(workspace), false);
  }
  writeFileSync(codeFile, meta);
  for (const extra of [["--name", "../escape"], ["--name", "existing;touch-owned"], ["--name", "UPPER"], ["--language", "invalid"], ["--unknown"], ["--name"], ["--name", "a", "--name", "b"]]) {
    failure(run(create, ["--verification-file", codeFile, "--workspace", workspace, "--no-build", ...extra]));
    assert.equal(existsSync(workspace), false);
  }
  failure(run(create, ["--workspace", workspace, "--no-build"]));
  assert.equal(existsSync(workspace), false);
});

test("verification alone creates four honest Chinese pages with local publication handoff", (t) => {
  const root = temporary(t);
  // Spaces, quotes and shell metacharacters remain literal filesystem names.
  const workspace = join(root, "workspace $not-a-command 'quoted'");
  const codeFile = join(root, "PartnerWhiz code.txt");
  writeFileSync(codeFile, `\uFEFF ${meta}\n`);
  const output = success(run(create, ["--verification-file", codeFile, "--workspace", workspace, "--name", "buying-guide", "--no-build"]));
  assert.match(output, /build=skipped/);
  assert.match(output, /verification=configured/);
  assert.match(output, /published=false/);
  assert.match(output, /partnerwhizApproval=not-checked/);
  assert.equal(output.includes(token), false);
  const site = join(workspace, "buying-guide");
  const input = json(join(site, ".ganhuo", "landerpilot-input.json"));
  assert.equal(input.partnerWhizVerificationToken, token);
  assert.equal(input.site_name, "好物选购笔记");
  assert.equal(input.language, "zh-CN");
  assert.equal("partnerwhiz_verification" in input, false);
  if (process.platform !== "win32") assert.equal(statSync(join(site, ".ganhuo", "landerpilot-input.json")).mode & 0o777, 0o600);
  assert.equal(existsSync(join(site, "public", ".ganhuo", "landerpilot-input.json")), false);
  const manifest = json(join(site, "public", ".ganhuo", "site.json"));
  assert.equal(manifest.template, "promotion");
  assert.deepEqual(manifest.pages, ["index.html", "guide/index.html", "about/index.html", "disclosure/index.html"]);
  assert.equal(JSON.stringify(manifest).includes(token), false);
  const allPages = routes.map((route) => {
    const source = page(site, route);
    assert.match(source, /<html lang="zh-CN" data-theme="ganhuo-ecommerce">/);
    assert.match(source, /<head><meta name="partnerwhiz-verify"/);
    assert.equal(source.split(meta).length - 1, 1);
    // Inspect the real section props that are serialized into each Astro page.
    for (const path of ["/", "/guide/", "/about/", "/disclosure/"]) assert.ok(source.includes(`"href": "${path}"`));
    assert.doesNotMatch(source, /<Testimonials|<ReviewHero|<CouponList|<StoreGrid|<Pricing3Tier|<StatsStrip|<NewsletterSignup|<ContactForm/);
    assert.doesNotMatch(source, /https?:\/\/|example\.com|AggregateRating|ReviewCount|Product"|"author":|"date":/);
    return source;
  });
  assert.match(allPages[0], /<HeroCentered/);
  assert.match(allPages[1], /用同一口径比较总成本/);
  assert.match(allPages[2], /尚未发布商品实测/);
  assert.match(allPages[3], /当前没有列出商品优惠/);
  const handoff = json(join(site, ".ganhuo", "deployment-handoff.json"));
  assert.equal(handoff.intent.operation, "new_deploy");
  assert.equal(handoff.localSite.build.ready, false);
  assert.equal(handoff.localSite.build.outputDir, "dist");
  const index = json(join(workspace, ".ganhuo", "landerpilot-sites.json"));
  assert.equal(index.sites[0].template, "promotion");
});

test("JSON-only English input works, and file/data conflicts cause no writes", (t) => {
  const root = temporary(t);
  const data = join(root, "english.json");
  const workspace = join(root, "workspace");
  writeFileSync(data, JSON.stringify({ partnerwhiz_verification: meta, language: "en", site_name: "Thoughtful & Practical" }));
  success(run(create, ["--data", data, "--workspace", workspace, "--name", "english", "--no-build"]));
  const source = page(join(workspace, "english"), "index");
  assert.match(source, /<html lang="en"/);
  assert.match(source, /<title>Thoughtful &amp; Practical<\/title>/);
  assert.match(source, /Start with what you need/);
  assert.doesNotMatch(source, /好物|选购/);
  const verification = join(root, "different.txt");
  writeFileSync(verification, "pw_other");
  const before = snapshot(workspace);
  failure(run(create, ["--data", data, "--verification-file", verification, "--workspace", workspace, "--no-build"]));
  assert.deepEqual(snapshot(workspace), before);
});

test("explicit URL-first creation has no token or tag and accepts a real token later without losing sites", (t) => {
  const root = temporary(t);
  const workspace = join(root, "workspace");
  const output = success(run(create, ["--without-verification", "--workspace", workspace, "--name", "url-first", "--no-build"]));
  assert.match(output, /verification=not-configured/);
  assert.match(output, /published=false/);
  assert.match(output, /partnerwhizApproval=not-checked/);
  assert.doesNotMatch(output, /pw_/);
  const site = join(workspace, "url-first");
  const inputPath = join(site, ".ganhuo", "landerpilot-input.json");
  const input = json(inputPath);
  assert.equal(Object.hasOwn(input, "partnerWhizVerificationToken"), false);
  assert.equal(Object.hasOwn(input, "partnerwhiz_verification"), false);
  assert.equal(input.language, "zh-CN");
  for (const route of routes) assert.doesNotMatch(page(site, route), /partnerwhiz-verify|pw_/);
  assert.equal(json(join(site, ".ganhuo", "deployment-handoff.json")).localSite.build.ready, false);
  const pagesBefore = json(join(site, "public", ".ganhuo", "site.json")).pages;

  success(run(create, ["--without-verification", "--workspace", workspace, "--name", "other-site", "--no-build"]));
  const otherBefore = snapshot(join(workspace, "other-site"));
  const sitesBefore = json(join(workspace, ".ganhuo", "landerpilot-sites.json")).sites.map((item) => item.path);
  writeFileSync(join(site, "public", "operator-note.txt"), "Keep this site asset");
  writeFileSync(inputPath, JSON.stringify({ ...input, partnerWhizVerificationToken: token }));
  for (let count = 0; count < 2; count += 1) {
    success(run(generate, ["--site", site, "--type", "promotion", "--data", inputPath]));
    for (const route of routes) assert.equal(page(site, route).split(meta).length - 1, 1);
  }
  assert.equal(json(inputPath).partnerWhizVerificationToken, token);
  assert.deepEqual(json(join(site, "public", ".ganhuo", "site.json")).pages, pagesBefore);
  assert.equal(readFileSync(join(site, "public", "operator-note.txt"), "utf8"), "Keep this site asset");
  assert.deepEqual(json(join(workspace, ".ganhuo", "landerpilot-sites.json")).sites.map((item) => item.path), sitesBefore);
  assert.deepEqual(snapshot(join(workspace, "other-site")), otherBefore);
});

test("without-verification allows non-token JSON preferences but rejects every token input before writes", (t) => {
  const root = temporary(t);
  const workspace = join(root, "not-created");
  const dataFile = join(root, "data.json");
  const codeFile = join(root, "code.txt");
  writeFileSync(codeFile, token);
  const common = ["--without-verification", "--workspace", workspace, "--no-build"];
  const fileConflict = run(create, [...common, "--verification-file", codeFile]);
  failure(fileConflict);
  assert.match(fileConflict.stderr, /cannot be combined/);
  assert.equal(existsSync(workspace), false);
  for (const key of ["partnerWhizVerificationToken", "partnerwhiz_verification"]) {
    for (const value of [token, meta, "", null]) {
      writeFileSync(dataFile, JSON.stringify({ [key]: value }));
      const conflict = run(create, [...common, "--data", dataFile]);
      failure(conflict);
      assert.match(conflict.stderr, /cannot be combined/);
      assert.equal(existsSync(workspace), false);
    }
  }
  writeFileSync(dataFile, JSON.stringify({ site_name: "URL First Guide", language: "en" }));
  // No flag still means a real token is required, including for --data files.
  failure(run(create, ["--data", dataFile, "--workspace", workspace, "--no-build"]));
  assert.equal(existsSync(workspace), false);
  const output = success(run(create, [...common, "--data", dataFile, "--name", "english-first"]));
  assert.match(output, /verification=not-configured/);
  assert.match(page(join(workspace, "english-first"), "index"), /<html lang="en"/);
  assert.equal(json(join(workspace, "english-first", ".ganhuo", "landerpilot-input.json")).site_name, "URL First Guide");
});

test("repeated regeneration retains and explicitly updates the verification token", (t) => {
  const root = temporary(t);
  const verification = join(root, "code.txt");
  const site = join(root, "workspace", "guide");
  writeFileSync(verification, token);
  success(run(create, ["--verification-file", verification, "--workspace", join(root, "workspace"), "--name", "guide", "--no-build"]));
  for (let count = 0; count < 2; count += 1) {
    success(run(generate, ["--site", site, "--type", "promotion"]));
    for (const route of routes) assert.equal(page(site, route).split(meta).length - 1, 1);
    assert.equal(json(join(site, ".ganhuo", "landerpilot-input.json")).partnerWhizVerificationToken, token);
  }
  const data = join(root, "updated.json");
  writeFileSync(data, JSON.stringify({ language: "en", partnerWhizVerificationToken: "pw_new" }));
  success(run(generate, ["--site", site, "--type", "promotion", "--data", data]));
  for (const route of routes) {
    assert.equal(page(site, route).includes(token), false);
    assert.equal(page(site, route).split('<meta name="partnerwhiz-verify" content="pw_new">').length - 1, 1);
  }
  const before = snapshot(site);
  writeFileSync(data, JSON.stringify({ partnerWhizVerificationToken: "pw_invalid space" }));
  failure(run(generate, ["--site", site, "--type", "promotion", "--data", data]));
  assert.deepEqual(snapshot(site), before);
});

test("existing paths including empty directories, files and symlinks are never overwritten", (t) => {
  const root = temporary(t);
  const workspace = join(root, "workspace");
  const verification = join(root, "code.txt");
  mkdirSync(workspace);
  writeFileSync(verification, token);
  mkdirSync(join(workspace, "empty"));
  mkdirSync(join(workspace, "occupied"));
  writeFileSync(join(workspace, "occupied", "keep.txt"), "existing user content");
  writeFileSync(join(workspace, "file"), "existing file");
  symlinkSync(join(root, "absent"), join(workspace, "link"));
  for (const name of ["empty", "occupied", "file", "link"]) {
    const before = snapshot(workspace);
    const result = run(create, ["--verification-file", verification, "--workspace", workspace, "--name", name, "--no-build"]);
    failure(result);
    assert.match(result.stderr, /Refusing to overwrite/);
    assert.deepEqual(snapshot(workspace), before);
  }
  assert.ok(lstatSync(join(workspace, "link")).isSymbolicLink());
});

test("omitting directory name reserves a distinct new site each time", (t) => {
  const root = temporary(t);
  const workspace = join(root, "workspace");
  const verification = join(root, "code.txt");
  writeFileSync(verification, token);
  const args = ["--verification-file", verification, "--workspace", workspace, "--no-build"];
  success(run(create, args));
  const first = json(join(workspace, ".ganhuo", "landerpilot-sites.json")).sites[0];
  const before = snapshot(join(workspace, first.path));
  success(run(create, args));
  const sites = json(join(workspace, ".ganhuo", "landerpilot-sites.json")).sites;
  assert.equal(sites.length, 2);
  assert.notEqual(sites[0].path, sites[1].path);
  assert.deepEqual(snapshot(join(workspace, first.path)), before);
});

test("workspace defaults to cwd when only the verification file is provided", (t) => {
  const root = temporary(t);
  const verification = join(root, "code.txt");
  writeFileSync(verification, token);
  success(run(create, ["--verification-file", verification, "--no-build"], { cwd: root }));
  const sites = json(join(root, ".ganhuo", "landerpilot-sites.json")).sites;
  assert.equal(sites.length, 1);
  assert.equal(page(join(root, sites[0].path), "index").split(meta).length - 1, 1);
});

test("a missing build tool fails with recoverable source and no ready publication claim", (t) => {
  const root = temporary(t);
  const verification = join(root, "code.txt");
  const noExecutables = join(root, "no-executables");
  mkdirSync(noExecutables);
  writeFileSync(verification, token);
  // Absolute Node paths still scaffold/generate. An empty PATH prevents npm
  // from starting, so this exercises default build failure without networking.
  const result = run(create, ["--verification-file", verification, "--workspace", join(root, "workspace"), "--name", "failed-build"], {
    env: { ...process.env, PATH: noExecutables },
  });
  failure(result);
  assert.match(result.stderr, /Could not run npm/);
  assert.match(result.stderr, /Site files retained/);
  assert.doesNotMatch(result.stdout, /build=ready|published=true/);
  const site = join(root, "workspace", "failed-build");
  assert.equal(json(join(site, ".ganhuo", "landerpilot-input.json")).partnerWhizVerificationToken, token);
  assert.equal(page(site, "index").split(meta).length - 1, 1);
  assert.equal(existsSync(join(site, ".ganhuo", "deployment-handoff.json")), false);
});

function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "lp-promotion-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 30_000, ...options });
}

function success(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function failure(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
}

function page(site, route) {
  return readFileSync(join(site, "src", "pages", ...(route === "index" ? [] : [route]), "index.astro"), "utf8");
}

function json(path) { return JSON.parse(readFileSync(path, "utf8")); }

function snapshot(dir, prefix = "") {
  const files = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const key = join(prefix, entry.name);
    if (entry.isSymbolicLink()) files[key] = "symlink";
    else if (entry.isDirectory()) { files[key] = "directory"; Object.assign(files, snapshot(path, key)); }
    else files[key] = readFileSync(path).toString("base64");
  }
  return files;
}
