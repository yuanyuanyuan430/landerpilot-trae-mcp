import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parsePartnerWhizToken } from './generators/shared/partnerwhiz-verification.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const workflowPath = join(root, 'skills/landerpilot/references/promotion-site.md');

/** Standard pi entry: no credentials, host overrides or extra dependencies. */
export default function landerpilotPromotion(pi) {
  pi.registerTool({
    name: 'landerpilot_pw',
    label: 'PW 验证与推广站',
    description: '用户说“过 PW 验证”时使用。guide 返回 LanderPilot→Cloudflare→域名→网站→PW 的逐步引导；create 在当前工作区生成推广站源文件。随后按引导构建、发布、验证，保留云端权限检查。',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['guide', 'create'] },
        verification: { type: 'string', maxLength: 2048, description: 'PartnerWhiz 提供的完整 meta 或 pw_ 验证码；没有网站时可省略，先建站获取网址。' },
        name: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' },
        language: { type: 'string', enum: ['zh-CN', 'en'] },
      },
      required: ['operation'],
      additionalProperties: false,
    },
    async execute(_id, input, signal, _onUpdate, context) {
      const workflow = await readFile(workflowPath, 'utf8');
      if (input.operation === 'guide') return result(workflow);
      if (input.operation !== 'create') throw new Error('Unsupported operation.');
      signal?.throwIfAborted();
      if (!context?.cwd) throw new Error('Open a workspace before creating a site.');
      const token = input.verification === undefined ? null : parsePartnerWhizToken(input.verification);
      const name = input.name || `shopping-guide-${randomUUID().slice(0, 8)}`;
      if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) throw new Error('Invalid site directory name.');
      const language = input.language ?? 'zh-CN';
      if (!['zh-CN', 'en'].includes(language)) throw new Error('Unsupported language.');
      const privateDir = join(context.cwd, '.ganhuo');
      await mkdir(privateDir, { recursive: true, mode: 0o700 });
      const inputPath = join(privateDir, `pw-input-${randomUUID()}.json`);
      try {
        const args = [join(root, 'skills/landerpilot/scripts/create-promotion-site.mjs'), '--workspace', context.cwd, '--name', name, '--language', language, '--no-build'];
        if (token) {
          await writeFile(inputPath, JSON.stringify({ partnerWhizVerificationToken: token }), { mode: 0o600, flag: 'wx' });
          args.push('--data', inputPath);
        } else {
          args.push('--without-verification');
        }
        // Source-only generation is a short, bounded local operation. Do not
        // kill its parent while spawnSync children still own the workspace.
        // Drain the operation before reporting cancellation; no build/network
        // runs here, and the shared-index lock has a 10-second deadline.
        const output = await run('node', args, { cwd: context.cwd, maxBuffer: 256 * 1024, windowsHide: true });
        signal?.throwIfAborted();
        return result(`${output.stdout}\n站点源文件已生成，尚未构建或发布。继续执行下面的工作流。\n\n${workflow}`, {
          sitePath: join(context.cwd, name),
          generated: true,
          built: false,
          published: false,
          verificationConfigured: !!token,
        });
      } finally {
        await unlink(inputPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }
    },
  });
}

function result(text, details = {}) {
  return { content: [{ type: 'text', text }], details };
}
