import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertPartnerWhizArtifact,
  canonicalPartnerWhizInput,
  injectPartnerWhizMeta,
  parsePartnerWhizToken,
  partnerWhizTokenFromInput,
  renderPartnerWhizMeta,
} from "./partnerwhiz-verification.mjs";
import { writeAstroSite } from "./write-astro-site.mjs";

const token = "pw_test-A_9";
const meta = `<meta name="partnerwhiz-verify" content="${token}">`;
const document = (head = "") => `<!doctype html><html lang="en"><head>${head}</head><body>Guide</body></html>`;

test("accepts a token or exactly one quoted meta tag, preserving case of the token", () => {
  for (const value of [token, ` \n${token}\t`, meta, `<meta content='${token}' name='partnerwhiz-verify'/>`, `<META\nNAME = 'PARTNERWHIZ-VERIFY' CONTENT = "${token}" />`]) {
    assert.equal(parsePartnerWhizToken(value), token);
  }
  assert.equal(parsePartnerWhizToken("pw_a"), "pw_a");
  assert.equal(parsePartnerWhizToken(`pw_${"a".repeat(200)}`).length, 203);
});

test("rejects malformed, ambiguous and executable verification inputs", () => {
  const invalid = [
    null, {}, 42, "", "pw_", "PW_a", "pw_a b", "pw_中文", "pw_a.b", "pw_a/b", "pw_a\0", "pw_a\nb", `pw_${"a".repeat(201)}`,
    "prefix pw_a", `<script>${meta}</script>`, `<div>${meta}</div>`, `<!--${meta}-->`, `<template>${meta}</template>`,
    meta + meta, meta + "<script>alert(1)</script>", meta + "text", meta + "<!-- comment -->", meta + "</meta>",
    '<meta name="other" content="pw_a">', '<meta name="partnerwhiz-verify">', '<meta content="pw_a">',
    '<meta name=partnerwhiz-verify content="pw_a">', '<meta name="partnerwhiz-verify" content=pw_a>',
    '<meta name="partnerwhiz-verify"content="pw_a">', '<meta name="partnerwhiz-verify" content="pw_a" onclick="evil()">',
    '<meta name="partnerwhiz-verify" content="pw_a" data-extra="x">', '<meta name="partnerwhiz-verify" NAME="other" content="pw_a">',
    '<meta name="partnerwhiz-verify" content="pw_a" CONTENT="pw_b">', '<meta name="partnerwhiz-verify" content="pw_a\n">',
    '<meta name="partnerwhiz-verify" content="pw_a\r">', '<meta name="partnerwhiz-verify" content="pw_a&gt;">',
    '<meta name="partnerwhiz-verify" content="pw_a>', '<meta name="partnerwhiz-verify" content="pw_a" / >',
    '</meta name="partnerwhiz-verify" content="pw_a">', '<meta name="partnerwhiz-verify" content="pw_a{process.exit()}">',
    '<meta name="partnerwhiz-verify" content="pw_a"/>\n<script/>',
    '<meta name="partnerwhiz-verify" content="pw_a"\u00a0>', '<meta name="partnerwhiz-verify" content="pw_a"\u000b>',
  ];
  for (const value of invalid) assert.throws(() => parsePartnerWhizToken(value), /Expected/, String(value));
});

test("canonical input stores only the token and rejects contradictory aliases", () => {
  assert.equal(partnerWhizTokenFromInput({}), null);
  assert.equal(partnerWhizTokenFromInput({ partnerwhiz_verification: meta }), token);
  assert.deepEqual(canonicalPartnerWhizInput({ partnerwhiz_verification: meta, site_name: "Example" }, token), {
    site_name: "Example", partnerWhizVerificationToken: token,
  });
  assert.throws(() => partnerWhizTokenFromInput({ partnerwhiz_verification: meta, partnerWhizVerificationToken: "pw_other" }), /Conflicting/);
  assert.throws(() => partnerWhizTokenFromInput({ partnerWhizVerificationToken: "" }), /Expected/);
  assert.throws(() => partnerWhizTokenFromInput(null), /object/);
});

test("built artifacts require no verification tag before configuration and exactly one canonical head tag afterwards", () => {
  assert.doesNotThrow(() => assertPartnerWhizArtifact(document()));
  assert.doesNotThrow(() => assertPartnerWhizArtifact(document(meta), token));
  assert.doesNotThrow(() => assertPartnerWhizArtifact(document(`<!-- ${meta} --><script>const text='${meta}';</script>`)));
  assert.doesNotThrow(() => assertPartnerWhizArtifact(document(`<meta name="description" content='Discuss name="partnerwhiz-verify" safely'>`)));
  const forms = [meta, '<META NAME="PARTNERWHIZ-VERIFY" CONTENT="pw_test-A_9">', "<meta content='pw_test-A_9' name='partnerwhiz-verify'>", '<meta name=partnerwhiz-verify content=pw_test-A_9>', '<meta name="partnerwhiz-verify" content="">'];
  for (const tag of forms) {
    assert.throws(() => assertPartnerWhizArtifact(document(tag)), /must not contain/);
    assert.throws(() => assertPartnerWhizArtifact(document().replace("</body>", tag + "</body>")), /must not contain/);
  }
  for (const html of [document(), document(meta + meta), document(renderPartnerWhizMeta("pw_wrong")), document(forms[1]), document().replace("</body>", meta + "</body>"), document(meta).replace("</body>", meta + "</body>")]) {
    assert.throws(() => assertPartnerWhizArtifact(html, token), /exactly one canonical/);
  }
  assert.throws(() => assertPartnerWhizArtifact("<html><body>Missing head</body></html>"), /explicit document head/);
  assert.throws(() => assertPartnerWhizArtifact(document(), ""), /Expected/);
});

test("places one canonical tag in the actual generated head without changing frontmatter or body", () => {
  const frontmatter = `---\nconst example = ${JSON.stringify(document(meta))};\n---\n`;
  const source = frontmatter + document('<meta name="description" content="keep > text">');
  const result = injectPartnerWhizMeta(source, token);
  assert.ok(result.startsWith(frontmatter));
  assert.equal(result.slice(frontmatter.length), document(meta + '<meta name="description" content="keep > text">'));
  assert.equal(injectPartnerWhizMeta(result, token), result);
  assert.equal(renderPartnerWhizMeta(meta), meta);
  assert.equal(injectPartnerWhizMeta(document(meta + renderPartnerWhizMeta("pw_old")), token), document(meta));
});

test("skips comment and raw-text decoys and rejects unsupported document shapes", () => {
  for (const decoy of [`<!-- ${meta}</head> -->`, `<script>const x='${meta}';</script>`, `<style>/* </head>${meta} */</style>`, `<title>&lt;meta&gt;</title>`]) {
    assert.equal(injectPartnerWhizMeta(document(decoy), token), document(meta + decoy));
  }
  for (const source of ["", "<html><body>Guide</body></html>", "<html><head>", document("<template>example</template>")]) {
    assert.throws(() => injectPartnerWhizMeta(source, token), /head|template/);
  }
});

test("invalid verification and malformed regenerated pages preserve every existing file", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lp-verification-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const plan = { title: "Guide", blueprint: "promotion", pages: [{ route: "index", content: document() }] };
  writeAstroSite(dir, plan, { input: { partnerWhizVerificationToken: token } });
  const before = snapshot(dir);
  for (const value of ["", "pw_", `${meta}<script>alert(1)</script>`]) {
    assert.throws(() => writeAstroSite(dir, plan, { input: { partnerWhizVerificationToken: value } }));
    assert.deepEqual(snapshot(dir), before);
  }
  assert.throws(() => writeAstroSite(dir, { ...plan, pages: [{ route: "index", content: "missing head" }] }, { input: {} }));
  assert.deepEqual(snapshot(dir), before);
  writeFileSync(join(dir, ".ganhuo", "landerpilot-input.json"), "{truncated");
  const corrupt = snapshot(dir);
  assert.throws(() => writeAstroSite(dir, plan, { input: {} }));
  assert.deepEqual(snapshot(dir), corrupt);
});

test("all existing blueprint producers support verification and retain it on regeneration", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "lp-blueprints-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const type of ["corporate", "blog", "cashback", "affiliate-review"]) {
    const input = JSON.parse(readFileSync(new URL(`../../blueprints/${type}/examples/basic.json`, import.meta.url), "utf8"));
    const { produce } = await import(`../../blueprints/${type}/producer.mjs`);
    const plan = await produce({ input });
    const site = join(dir, type);
    writeAstroSite(site, plan, { input: { ...input, partnerWhizVerificationToken: token } });
    writeAstroSite(site, await produce({ input }), { input });
    for (const page of plan.pages) {
      const source = readFileSync(join(site, "src", "pages", ...(page.route === "index" ? [] : [page.route]), "index.astro"), "utf8");
      assert.equal(source.split(meta).length - 1, 1, `${type}/${page.route}`);
      assert.match(source, /<head>\s*<meta name="partnerwhiz-verify"/);
    }
    assert.equal(JSON.parse(readFileSync(join(site, ".ganhuo", "landerpilot-input.json"))).partnerWhizVerificationToken, token);
  }
});

function snapshot(dir, prefix = "") {
  const files = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const key = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(files, snapshot(path, key));
    else files[key] = readFileSync(path).toString("base64");
  }
  return files;
}
