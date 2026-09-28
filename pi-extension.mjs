import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parsePartnerWhizToken } from './generators/shared/partnerwhiz-verification.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const workflowPath = join(root, 'skills/landerpilot/references/promotion-site.md');
const createScript = join(root, 'skills/landerpilot/scripts/create-promotion-site.mjs');
const localToolsScript = join(root, 'skills/landerpilot/scripts/local-tools.mjs');

async function readWorkflow() {
  const workflow = await readFile(workflowPath, 'utf8');
  return `${workflow.replaceAll('<plugin>', root.replace(/[/\\]$/, ''))}\n本插件本地脚本的实际路径：\n- 创建站点：${JSON.stringify(createScript)}\n- 检查与发布交接：${JSON.stringify(localToolsScript)}\n`;
}

/** Standard Pi tools with the tool-only @ganhuo/pi-ui API v1 declaration.
 * The host matches the owner renderer and definition by object identity.
 * This declares policies; the host still decides whether a call is allowed.
 */
export default function landerpilotPromotion(pi) {
  const owner = () => {};
  pi.registerMessageRenderer('ganhuo:ui:owner', owner);
  const register = (definition, policy) => {
    pi.registerTool(definition);
    pi.events.emit('ganhuo:ui:declare', {
      owner, apiVersion: 1, kind: 'tool', definition, policy,
    });
  };

  register({
    name: 'landerpilot_pw',
    label: 'PW 验证引导',
    description: '用户说“过 PW 验证”时先调用。只读返回账号→Cloudflare→选站/域名→发布→PW 回执流程；目标未明确不能猜选，标签上线后须继续网页验证或说明具体阻塞。需要新建网站时按引导调用 landerpilot_pw_create。',
    executionMode: 'parallel',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['guide'], description: '只读引导；create 已拆分为 landerpilot_pw_create，避免读权限允许写入。' },
        verification: { type: 'string', maxLength: 2048, description: '可选的 PW 验证代码；guide 不保存、不安装。' },
      },
      additionalProperties: false,
    },
    async execute(_id, input, signal) {
      signal?.throwIfAborted();
      if (input.operation !== undefined && input.operation !== 'guide') {
        throw new Error('Use landerpilot_pw_create for explicitly requested new sites.');
      }
      const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const notice = input.verification === undefined ? '' : '这是只读引导；提供的验证码尚未保存、安装或校验。\n\n';
      return result(notice + await readWorkflow(), {
        version: manifest.version,
        readOnly: true,
        verificationProvided: input.verification !== undefined,
        verificationSaved: false,
        pluginRoot: root,
        createScript,
        localToolsScript,
      });
    },
  }, {
    capability: 'landerpilot.pw.guide', risk: 'read', approval: 'allow',
    network: 'none', workspaceBoundary: 'not-applicable',
  });

  register({
    name: 'landerpilot_pw_create',
    label: '生成 PW 推广站',
    description: '仅在用户明确选择新建网站后调用，在当前工作区创建独立目录及推广站源码。目标选择被跳过或已有网站仅需添加标签时不调用。此工具不构建、不发布、不操作 PW；按返回流程继续到最终验证回执。',
    executionMode: 'sequential',
    parameters: {
      type: 'object',
      properties: {
        verification: { type: 'string', maxLength: 2048, description: 'PW 提供的 meta/token；尚无网站和验证码时可省略，先建站取网址。' },
        name: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' },
        language: { type: 'string', enum: ['zh-CN', 'en'] },
      },
      additionalProperties: false,
    },
    async execute(_id, input, signal, _onUpdate, context) {
      signal?.throwIfAborted();
      if (!context?.cwd) throw new Error('Open a workspace before creating a site.');
      const workspace = await safeWorkspace(context.cwd);
      const workflow = await readWorkflow();
      const token = input.verification === undefined ? null : parsePartnerWhizToken(input.verification);
      const name = input.name || `shopping-guide-${randomUUID().slice(0, 8)}`;
      if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) throw new Error('Invalid site directory name.');
      const language = input.language ?? 'zh-CN';
      if (!['zh-CN', 'en'].includes(language)) throw new Error('Unsupported language.');
      const privateDir = join(workspace, '.ganhuo');
      await mkdir(privateDir, { recursive: true, mode: 0o700 });
      const inputPath = join(privateDir, `pw-input-${randomUUID()}.json`);
      try {
        const args = [createScript, '--workspace', workspace, '--name', name, '--language', language, '--no-build'];
        if (token) {
          await writeFile(inputPath, JSON.stringify({ partnerWhizVerificationToken: token }), { mode: 0o600, flag: 'wx' });
          args.push('--data', inputPath);
        } else {
          args.push('--without-verification');
        }
        // Drain source-only generation before reporting cancellation so a
        // terminated parent cannot leave spawnSync children writing afterward.
        const output = await run('node', args, { cwd: workspace, maxBuffer: 256 * 1024, windowsHide: true });
        signal?.throwIfAborted();
        return result(`${output.stdout}\n站点源文件已生成，尚未构建或发布。继续执行下面的工作流。\n\n${workflow}`, {
          sitePath: join(workspace, name), generated: true, built: false,
          published: false, verificationConfigured: !!token,
        });
      } finally {
        await unlink(inputPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }
    },
  }, {
    capability: 'landerpilot.pw.create', risk: 'write', approval: 'ask',
    network: 'none', workspaceBoundary: 'required',
  });
}

async function safeWorkspace(cwd) {
  const workspace = await realpath(cwd);
  // A chosen workspace may itself be an alias, but its writable shared index
  // must not redirect into another directory through existing symbolic links.
  for (const path of ['.ganhuo', '.ganhuo/landerpilot-sites.json', '.ganhuo/landerpilot-sites.lock']) {
    const entry = await lstat(join(workspace, path)).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (entry?.isSymbolicLink()) throw new Error('The workspace site index contains a symbolic link. Choose a workspace with a local .ganhuo index.');
  }
  return workspace;
}

function result(text, details = {}) {
  return { content: [{ type: 'text', text }], details };
}
