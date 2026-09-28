import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

/** Windows npm.cmd is not an executable; invoke its JS entry with Node. */
export function npmCommand({ platform = process.platform, execPath = process.execPath, env = process.env, exists = existsSync } = {}) {
  if (platform !== 'win32') return { command: 'npm', args: [] };
  const candidates = [
    env.npm_execpath,
    join(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'),
    ...(env.PATH || env.Path || '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean)
      .map(directory => join(directory, 'node_modules/npm/bin/npm-cli.js')),
  ];
  const cli = candidates.find(path => typeof path === 'string' && /(?:^|[/\\])npm-cli\.js$/.test(path) && exists(path));
  if (!cli) throw new Error('Bundled npm-cli.js was not found. Check the app Node.js runtime and retry.');
  return { command: execPath, args: [cli] };
}
