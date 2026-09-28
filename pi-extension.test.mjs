import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import extension from './pi-extension.mjs';
import { npmCommand } from './generators/shared/npm-command.mjs';

function register(name = 'landerpilot_pw_create') {
  const tools = [];
  const declarations = [];
  let owner;
  extension({ registerTool: tool => tools.push(tool), registerMessageRenderer: (_key, value) => { owner = value; }, events: { emit: (_event, value) => declarations.push(value) } });
  assert.equal(declarations.length, 2);
  for (const item of declarations) { assert.equal(item.owner, owner); assert.equal(item.definition, tools.find(tool => tool.name === item.definition.name)); }
  assert.equal(tools.length, 2);
  return tools.find(tool => tool.name === name);
}
test('guide exposes the real guided chain without generating files', async () => {
  const response = await register('landerpilot_pw').execute('test', { operation: 'guide' });
  for (const name of ['get_account_status', 'inspect_project', 'list_domains', 'create_or_update_site_project', 'prepare_artifact_upload', 'complete_artifact_upload', 'deploy_site', 'get_deployment_status', 'set_site_verification', 'PartnerWhiz']) {
    assert.ok(response.content[0].text.includes(name), name);
  }
});
test('create uses isolated workspace, retains a real token and does not claim publication', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-test-'));
  try {
    const output = await register().execute('test', { name: 'promotion', verification: 'pw_test' }, undefined, undefined, { cwd });
    assert.equal(output.details.published, false);
    assert.equal(output.details.built, false);
    const page = await readFile(join(cwd, 'promotion/src/pages/index.astro'), 'utf8');
    assert.match(page, /name="partnerwhiz-verify" content="pw_test"/);
    assert.ok(!(await readdir(join(cwd, '.ganhuo'))).some(name => name.startsWith('pw-input-')));
    await assert.rejects(register().execute('test', { name: 'promotion', verification: 'pw_test' }, undefined, undefined, { cwd }), /overwrite/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('new-site-first flow has no placeholder verification', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-new-'));
  try {
    const output = await register().execute('test', { name: 'promotion' }, undefined, undefined, { cwd });
    assert.equal(output.details.verificationConfigured, false);
    assert.doesNotMatch(await readFile(join(cwd, 'promotion/src/pages/index.astro'), 'utf8'), /name="partnerwhiz-verify"/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('rejects executable HTML and path traversal before writing', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-pi-invalid-'));
  try {
    for (const input of [{ verification: '<script>alert(1)</script>' }, { verification: 'pw_test', name: '../outside' }]) {
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
    const pending = register().execute('test', { name: 'cancelled' }, controller.signal, undefined, { cwd });
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

test('guide cannot execute creation through a read-only tool name', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pw-guide-read-'));
  try {
    const tool = register('landerpilot_pw');
    const response = await tool.execute('test', {}, undefined, undefined, { cwd });
    assert.equal(response.details.readOnly, true);
    assert.equal(response.details.version, '0.2.1');
    assert.ok(response.content[0].text.includes(JSON.stringify(response.details.createScript)));
    assert.ok(response.content[0].text.includes(JSON.stringify(response.details.localToolsScript)));
    assert.ok(!response.content[0].text.includes('<plugin>'));
    assert.match(response.content[0].text, /用户跳过、关闭或未回答/);
    assert.match(response.content[0].text, /不再以“要我打开浏览器你说一声”结束/);
    await assert.rejects(tool.execute('test', { operation: 'create' }, undefined, undefined, { cwd }), /landerpilot_pw_create/);
    assert.deepEqual(await readdir(cwd), []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('read and write policies bind the exact registered definitions to one owner', () => {
  const definitions = [];
  const declarations = [];
  let identity;
  extension({ registerTool: tool => definitions.push(tool), registerMessageRenderer: (key, owner) => { assert.equal(key, 'ganhuo:ui:owner'); identity = owner; }, events: { emit: (event, value) => { assert.equal(event, 'ganhuo:ui:declare'); declarations.push(value); } } });
  assert.equal(declarations.length, 2);
  assert.equal(declarations[0].definition, definitions[0]);
  assert.equal(declarations[1].definition, definitions[1]);
  for (const declaration of declarations) {
    assert.equal(declaration.owner, identity);
    assert.equal(declaration.apiVersion, 1);
    assert.equal(declaration.kind, 'tool');
    assert.equal(declaration.policy.network, 'none');
  }
  assert.equal(declarations[0].definition.name, 'landerpilot_pw');
  assert.equal(declarations[0].policy.risk, 'read');
  assert.equal(declarations[0].policy.approval, 'allow');
  assert.equal(declarations[1].definition.name, 'landerpilot_pw_create');
  assert.equal(declarations[1].policy.risk, 'write');
  assert.equal(declarations[1].policy.approval, 'ask');
  assert.equal(definitions[1].executionMode, 'sequential');
});

test('guide reports that a supplied code was not saved or installed', async () => {
  const response = await register('landerpilot_pw').execute('test', { operation: 'guide', verification: 'pw_test' });
  assert.equal(response.details.verificationProvided, true);
  assert.equal(response.details.verificationSaved, false);
  assert.match(response.content[0].text, /尚未保存、安装或校验/);
  assert.ok(!response.content[0].text.includes('pw_test'));
});

test('create rejects linked shared metadata before writing outside the workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pw-linked-index-'));
  try {
    const outside = join(root, 'outside');
    await mkdir(outside);
    const target = join(outside, 'index.json');
    await writeFile(target, 'original');
    for (const linkParent of [true, false]) {
      const cwd = join(root, linkParent ? 'parent-link' : 'file-link');
      await mkdir(cwd);
      if (linkParent) await symlink(outside, join(cwd, '.ganhuo'), 'dir');
      else {
        await mkdir(join(cwd, '.ganhuo'));
        await symlink(target, join(cwd, '.ganhuo/landerpilot-sites.json'), 'file');
      }
      await assert.rejects(register().execute('test', { name: 'must-not-exist' }, undefined, undefined, { cwd }), /symbolic link/);
      assert.equal(await readFile(target, 'utf8'), 'original');
      assert.deepEqual(await readdir(outside), ['index.json']);
      assert.ok(!(await readdir(cwd)).includes('must-not-exist'));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
