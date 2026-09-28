#!/usr/bin/env node
/**
 * Offline integration against a Ganhuo source checkout with installed deps.
 * Uses a packed/extracted plugin, never its source-workspace node_modules.
 *
 * node scripts/verify-ganhuo-runtime.mjs --host-root ../ganhuo-ai-next
 * node scripts/verify-ganhuo-runtime.mjs --host-root ../ganhuo-ai-next --package-tar ./plugin.tgz
 * node scripts/verify-ganhuo-runtime.mjs --host-root ../ganhuo-ai-next --package-root ./extracted/package
 *
 * GANHUO_HOST_ROOT is the alternative to --host-root. --work-root controls
 * temporary files (default: ./work); --keep-work retains them for diagnosis.
 * This verifies the source host/Pi engine, not installed-app UI or deployment.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

let temporary;
let keepWork = false;
try {
  const { values } = parseArgs({ options: {
    'host-root': { type: 'string' },
    'package-root': { type: 'string' },
    'package-tar': { type: 'string' },
    'work-root': { type: 'string' },
    'keep-work': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  } });
  if (values.help) {
    console.log('Usage: node scripts/verify-ganhuo-runtime.mjs --host-root <Ganhuo checkout with node_modules> [--package-root <directory> | --package-tar <archive>] [--work-root <scratch directory>] [--keep-work]\nEnvironment alternative: GANHUO_HOST_ROOT. Offline; no app UI, credentials, or host-source changes.');
  } else {
    keepWork = values['keep-work'];
    if (values['package-root'] && values['package-tar']) throw new Error('Choose --package-root or --package-tar, not both.');
    const requestedHost = values['host-root'] || process.env.GANHUO_HOST_ROOT;
    if (!requestedHost) throw new Error('Ganhuo host is required: pass --host-root <checkout with node_modules> or set GANHUO_HOST_ROOT. No dependencies will be installed.');
    const hostRoot = realpathSync(resolve(requestedHost));
    for (const file of ['vitest.config.ts', 'node_modules/vitest/vitest.mjs', 'src/main/engine/extensions/pi-ui-host.ts', 'src/main/engine/interaction/permission-policy.ts']) {
      if (!existsSync(join(hostRoot, file))) throw new Error(`Ganhuo host is missing ${file}; supply a compatible checkout with dependencies already installed.`);
    }
    const hostRequire = createRequire(join(hostRoot, 'package.json'));
    const workRoot = resolve(values['work-root'] || 'work');
    mkdirSync(workRoot, { recursive: true });
    temporary = mkdtempSync(join(workRoot, 'landerpilot-runtime-'));
    const scratch = realpathSync(temporary);
    const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'PATHEXT', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(childEnv, {
      CI: '1', NO_COLOR: '1',
      PI_CODING_AGENT_DIR: join(scratch, 'agent'),
      LANDERPILOT_RUNTIME_WORK: scratch,
    });
    let archive = values['package-tar'] && resolve(values['package-tar']);
    if (!archive) {
      const source = realpathSync(resolve(values['package-root'] || fileURLToPath(new URL('..', import.meta.url))));
      writeFileSync(join(scratch, 'npm-user-config'), '');
      writeFileSync(join(scratch, 'npm-global-config'), '');
      const packed = run('npm', ['pack', '--json', '--offline', '--ignore-scripts', '--pack-destination', scratch,
        '--cache', join(scratch, 'npm-cache'), '--userconfig', join(scratch, 'npm-user-config'), '--globalconfig', join(scratch, 'npm-global-config')], source, childEnv);
      const filename = JSON.parse(packed.stdout)[0]?.filename;
      if (!filename || filename !== filename.split(/[\\/]/).at(-1)) throw new Error('npm pack did not return a local archive filename.');
      archive = join(scratch, filename);
    }
    const unpacked = join(scratch, 'unpacked');
    mkdirSync(unpacked);
    let entries = 0;
    let bytes = 0;
    await hostRequire('tar').x({ file: archive, cwd: unpacked, strict: true,
      filter(entryPath, entry) {
        entries += 1;
        bytes += entry.size || 0;
        if (isAbsolute(entryPath) || entryPath.includes('\\') || entryPath.split('/').includes('..') ||
            !['File', 'Directory'].includes(entry.type) || entries > 10_000 || bytes > 128 * 1024 * 1024) {
          throw new Error(`Unsupported package archive entry: ${entryPath}`);
        }
        if (entryPath.split('/').includes('node_modules')) throw new Error('Package archive must not contain node_modules; the plugin must be self-contained.');
        return true;
      },
    });
    const packageRoot = join(unpacked, 'package');
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    if (!manifest.pi?.extensions?.length) throw new Error('Package has no pi.extensions entry.');
    childEnv.LANDERPILOT_RUNTIME_PACKAGE = packageRoot;
    copyFileSync(new URL('./fixtures/ganhuo-runtime-test.ts', import.meta.url), join(scratch, 'ganhuo-runtime.test.ts'));
    const config = join(scratch, 'vitest.config.mjs');
    // Reuse the checkout's aliases, but confine discovery and caches to scratch.
    // Only harness imports resolve host dependencies; plugin loading uses Pi's
    // native loader against the isolated extracted package.
    writeFileSync(config, `import host from ${JSON.stringify(pathToFileURL(join(hostRoot, 'vitest.config.ts')).href)};
export default {
  ...host,
  root: ${JSON.stringify(scratch)},
  cacheDir: ${JSON.stringify(join(scratch, 'vite-cache'))},
  resolve: { ...host.resolve, alias: [
    ...Object.entries(host.resolve.alias).map(([find, replacement]) => ({ find, replacement })),
    ...${JSON.stringify(['vitest', '@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'].map(find => {
      const dependency = join(hostRoot, 'node_modules', find);
      const manifest = JSON.parse(readFileSync(join(dependency, 'package.json'), 'utf8'));
      const entry = manifest.exports['.'].import;
      return { find, replacement: join(dependency, typeof entry === 'string' ? entry : entry.default) };
    }))}
  ] },
  test: { environment: 'node', include: ['ganhuo-runtime.test.ts'],
    testTimeout: 15000, hookTimeout: 15000, maxWorkers: 1, fileParallelism: false,
    watch: false, reporters: ['verbose'] }
};
`);
    console.log(`Ganhuo runtime regression: ${manifest.name}@${manifest.version}\nHost: ${hostRoot}\nPlugin: isolated archive (no source node_modules)`);
    const result = run(process.execPath, [join(hostRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config], scratch, childEnv);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    console.log('PASS: real Ganhuo policy and Pi execution; offline fixture model only. Installed-app/native UI is not covered.');
  }
} catch (error) {
  console.error(`Ganhuo runtime verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary && keepWork) console.log(`Kept runtime work: ${temporary}`);
  else if (temporary) rmSync(temporary, { recursive: true, force: true });
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 90_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command === process.execPath ? 'Vitest' : command} failed (${result.error?.message || result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  return result;
}
