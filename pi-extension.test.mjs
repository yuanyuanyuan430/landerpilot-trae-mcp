import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import extension from './pi-extension.mjs';
import { npmCommand } from './generators/shared/npm-command.mjs';

function register() {
  const tools = [];
  extension({ registerTool: tool => tools.push(tool) });
  assert.equal(tools.length, 1);
  return tools[0];
}
test('guide exposes the real guided chain without generating files', async () => {
  const response = await register().execute('test', { operation: 'guide' });
  for (const name of ['get_account_status', 'inspect_project', 'list_domains', 'create_or_update_site_project', 'prepare_artifact_upload', 'complete_artifact_upload', 'deploy_site', 'get_deployment_status', 'set_site_verification', 'PartnerWhiz']) {
    assert.ok(response.content[0].text.includes(name), name);
  }
});
test('create uses isolated workspace, retains a real token and does not claim publication', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-test-'));
  try {
    const output = await register().execute('test', { operation: 'create', name: 'promotion', verification: 'pw_test' }, undefined, undefined, { cwd });
    assert.equal(output.details.published, false);
    assert.equal(output.details.built, false);
    const page = await readFile(join(cwd, 'promotion/src/pages/index.astro'), 'utf8');
    assert.match(page, /name="partnerwhiz-verify" content="pw_test"/);
    assert.ok(!(await readdir(join(cwd, '.ganhuo'))).some(name => name.startsWith('pw-input-')));
    await assert.rejects(register().execute('test', { operation: 'create', name: 'promotion', verification: 'pw_test' }, undefined, undefined, { cwd }), /overwrite/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('new-site-first flow has no placeholder verification', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-new-'));
  try {
    const output = await register().execute('test', { operation: 'create', name: 'promotion' }, undefined, undefined, { cwd });
    assert.equal(output.details.verificationConfigured, false);
    assert.doesNotMatch(await readFile(join(cwd, 'promotion/src/pages/index.astro'), 'utf8'), /name="partnerwhiz-verify"/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('rejects executable HTML and path traversal before writing', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-invalid-'));
  try {
    for (const input of [{ operation: 'create', verification: '<script>alert(1)</script>' }, { operation: 'create', verification: 'pw_test', name: '../outside' }]) {
      await assert.rejects(register().execute('test', input, undefined, undefined, { cwd }));
      assert.deepEqual(await readdir(cwd), []);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('cancellation drains source generation before returning, leaving no child writes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-cancel-'));
  const lock = join(cwd, '.ganhuo/landerpilot-sites.lock');
  const controller = new AbortController();
  try {
    await mkdir(lock, { recursive: true });
    let settled = false;
    const pending = register().execute('test', { operation: 'create', name: 'cancelled' }, controller.signal, undefined, { cwd });
    const outcome = pending.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await stat(join(cwd, 'cancelled/package.json')).then(() => true, () => false)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(settled, false, 'must wait for the child holding the write operation');
    await rm(lock, { recursive: true });
    assert.equal((await outcome)?.name, 'AbortError');
    const before = await readFile(join(cwd, '.ganhuo/landerpilot-sites.json'), 'utf8');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await readFile(join(cwd, '.ganhuo/landerpilot-sites.json'), 'utf8'), before);
    assert.ok(!(await readdir(join(cwd, '.ganhuo'))).some(name => name.startsWith('pw-input-')));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Windows npm uses a JS entry and argv without executing a cmd shell', () => {
  const execPath = join('runtime with spaces', 'node.exe');
  const cli = join('runtime with spaces', 'node_modules/npm/bin/npm-cli.js');
  assert.deepEqual(npmCommand({ platform: 'win32', execPath, env: {}, exists: path => path === cli }), { command: execPath, args: [cli] });
  assert.throws(() => npmCommand({ platform: 'win32', execPath, env: {}, exists: () => false }), /npm-cli/);
  assert.deepEqual(npmCommand({ platform: 'darwin' }), { command: 'npm', args: [] });
});
