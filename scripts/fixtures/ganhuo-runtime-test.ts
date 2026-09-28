// Executed only by verify-ganhuo-runtime.mjs in an isolated temporary directory.
// All registration, identity matching, policy and execution code below is real
// Ganhuo/Pi code. Only the model response and approval response are fixtures.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { PiUiPackageHost } from '@main/engine/extensions/pi-ui-host';
import { composeExtensionHost } from '@main/engine/extensions/extension-host';
import { SceneHost } from '@main/engine/scene/scene-host';
import { createDeclaredSchemaRegistry } from '@main/engine/interaction/declared-schemas';
import { createPermissionExtension } from '@main/engine/interaction/permission-extension';
import { InteractionBroker } from '@main/engine/interaction/interaction-broker';
import { evaluate, ruleFromApproval, type PermissionRule } from '@main/engine/interaction/permission-policy';

const packageRoot = process.env.LANDERPILOT_RUNTIME_PACKAGE!;
const scratch = process.env.LANDERPILOT_RUNTIME_WORK!;
if (!packageRoot || !scratch) throw new Error('Run this fixture through scripts/verify-ganhuo-runtime.mjs.');
const cleanups: Array<() => unknown> = [];
const noNetwork = vi.fn(() => { throw new Error('This regression must never send a network request.'); });
beforeAll(() => {
  vi.stubGlobal('fetch', noNetwork);
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(noNetwork as never);
  vi.spyOn(tls, 'connect').mockImplementation(noNetwork as never);
});
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expect(noNetwork).not.toHaveBeenCalled();
  } finally { noNetwork.mockClear(); }
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function attach(root = packageRoot, rules: PermissionRule[] = []) {
  const temp = mkdtempSync(join(scratch, 'session-'));
  const workspace = join(temp, 'workspace');
  const agentDir = join(temp, 'agent');
  mkdirSync(workspace);
  mkdirSync(agentDir);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const reports: Array<{ event: string; data: Record<string, unknown> }> = [];
  const host = new PiUiPackageHost(new SceneHost({ emit() {}, newSceneId: () => 'unused' }),
    (event, data) => reports.push({ event, data }));
  cleanups.push(() => host.dispose());
  const release = vi.fn();
  const prepared = host.prepare(temp, { packages: [{ name: manifest.name, version: manifest.version, root }], release });
  const broker = new InteractionBroker();
  cleanups.push(() => broker.clearAll());
  const interactions: any[] = [];
  const permission = createPermissionExtension({
    sessionId: temp, workspace, mode: 'normal', broker,
    resolvePolicy: name => composed.resolvePolicy(name),
    ruleStore: { load: () => rules, append: (_workspace, rule) => { rules.push(rule); } },
    isSessionUsable: () => true,
    ingest(events) {
      interactions.push(...events);
      for (const event of events) if (event.kind === 'interaction-request') broker.respond(event.requestId, 'deny');
    },
  });
  const composed = composeExtensionHost([
    { extensionId: 'test.permission', extension: permission.factory },
    ...prepared.registrations,
    // finalize places native packages before the final startup factory, as in
    // session-assembly.ts. No policy is declared by any fixture registration.
    { extensionId: 'test.startup', extension: () => {} },
  ], { declaredSchemas: createDeclaredSchemaRegistry() });
  expect(composed.resolvePolicy('landerpilot_pw')).toBeUndefined();
  expect(composed.resolvePolicy('landerpilot_pw_create')).toBeUndefined();
  const settings = SettingsManager.inMemory({}, { projectTrusted: false });
  const loader = new DefaultResourceLoader({
    cwd: workspace, agentDir, settingsManager: settings,
    noExtensions: true, additionalExtensionPaths: prepared.paths,
    eventBus: prepared.eventBus, extensionFactories: [...composed.factories],
    extensionsOverride: result => prepared.finalize(result, composed.toolNames),
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  const models = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null,
    modelsStorePath: join(agentDir, 'models.json'), allowModelNetwork: false, refreshOnCreate: false });
  models.registerProvider('offline-regression', {
    baseUrl: 'https://unused.invalid/v1', api: 'openai-responses', apiKey: 'fixture-not-a-credential',
    models: [{ id: 'fixture', name: 'Offline fixture', input: ['text'], reasoning: false,
      contextWindow: 100_000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  });
  const { session } = await createAgentSession({ cwd: workspace, agentDir, resourceLoader: loader,
    model: models.getModel('offline-regression', 'fixture'), modelRuntime: models,
    settingsManager: settings, sessionManager: SessionManager.inMemory(workspace), noTools: 'builtin' });
  cleanups.push(() => session.dispose());
  await session.bindExtensions({ mode: 'rpc' });
  const tools = session.extensionRunner!.getAllRegisteredTools();
  const query = (name: string, input: unknown = {}, remembered = rules) => evaluate({
    mode: 'normal', origin: 'desktop', toolName: name, input,
    policy: composed.resolvePolicy(name), rules: remembered, now: Date.now(),
  });
  return { session, composed, tools, query, workspace, interactions, reports, prepared, release };
}

// Send a deterministic tool-call response through Pi's actual agent loop. Do
// not call definition.execute() directly: that bypasses the permission gate.
async function invoke(session: Awaited<ReturnType<typeof attach>>['session'], name: string, input: Record<string, unknown>) {
  let turns = 0;
  session.agent.streamFunction = ((model: any) => {
    const stream = createAssistantMessageEventStream();
    const call = turns++ === 0;
    stream.push({ type: 'done', reason: call ? 'toolUse' : 'stop', message: {
      role: 'assistant', content: call ? [{ type: 'toolCall', id: `offline_${session.messages.length}`, name, arguments: input }]
        : [{ type: 'text', text: 'Offline regression complete.' }],
      api: model.api, provider: model.provider, model: model.id, stopReason: call ? 'toolUse' : 'stop',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      timestamp: Date.now(),
    } } as never);
    return stream;
  }) as never;
  const before = session.messages.length;
  await session.prompt('Run the offline regression fixture.');
  expect(turns).toBe(2);
  const results = session.messages.slice(before).filter(message => message.role === 'toolResult');
  expect(results).toHaveLength(1);
  return results[0] as any;
}

describe('packed LanderPilot in the real Ganhuo host and Pi permission gate', () => {
  it('counterfactual: pi.registerTool alone loads but the actual host gate blocks execution', async () => {
    const oldRoot = join(scratch, 'old-unbound-package');
    mkdirSync(oldRoot);
    writeFileSync(join(oldRoot, 'package.json'), JSON.stringify({ name: 'old-unbound-landerpilot', version: '0.2.0', type: 'module', pi: { extensions: ['./index.mjs'] } }));
    writeFileSync(join(oldRoot, 'index.mjs'), `
      export default pi => pi.registerTool({ name: 'landerpilot_pw', label: 'Old guide', description: 'Old unbound registration',
        parameters: { type: 'object', properties: { operation: { type: 'string', enum: ['guide'] } }, required: ['operation'] },
        async execute() { throw new Error('UNBOUND_EXECUTION_MUST_NOT_RUN'); }
      });
    `);
    const runtime = await attach(oldRoot);
    expect(runtime.tools.map(tool => tool.definition.name)).toEqual(['landerpilot_pw']);
    expect(runtime.composed.resolvePolicy('landerpilot_pw')).toBeUndefined();
    const blocked = runtime.query('landerpilot_pw', { operation: 'guide' });
    expect(blocked).toMatchObject({ kind: 'block', reason: expect.stringContaining('未在 Ganhuo Runtime 中登记') });
    const result = await invoke(runtime.session, 'landerpilot_pw', { operation: 'guide' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('未在 Ganhuo Runtime 中登记');
    expect(JSON.stringify(result.content)).not.toContain('UNBOUND_EXECUTION_MUST_NOT_RUN');
    expect(runtime.reports.filter(report => report.event === 'tool_finished')).toEqual([]);
    expect(runtime.interactions).toEqual([]);
  });

  it('finalize binds both real tool identities; guide and create retain separate policies', async () => {
    const runtime = await attach();
    expect(runtime.tools.map(tool => tool.definition.name).sort()).toEqual(['landerpilot_pw', 'landerpilot_pw_create']);
    expect(runtime.composed.resolvePolicy('landerpilot_pw')).toMatchObject({ risk: 'read', approval: 'allow', network: 'none', workspaceBoundary: 'not-applicable' });
    expect(runtime.composed.resolvePolicy('landerpilot_pw_create')).toMatchObject({ risk: 'write', approval: 'ask', network: 'none', workspaceBoundary: 'required' });
    expect(runtime.tools.find(tool => tool.definition.name === 'landerpilot_pw_create')!.definition.executionMode).toBe('sequential');
    expect(runtime.query('landerpilot_pw')).toMatchObject({ kind: 'allow', source: 'read-only' });
    expect(runtime.query('landerpilot_pw_create', { name: 'approval-required' })).toEqual({ kind: 'ask', dangerous: false });
    expect(runtime.composed.resolveToolSource('landerpilot_pw').kind).toBe('extension');
    expect(runtime.composed.resolveToolSource('landerpilot_pw_create').id).toBe(runtime.composed.resolveToolSource('landerpilot_pw').id);
  });

  it.each([{}, { operation: 'guide' }])('executes guide %j through the real Pi gate without prompting, writing or network', async input => {
    const runtime = await attach();
    const before = readdirSync(runtime.workspace);
    const result = await invoke(runtime.session, 'landerpilot_pw', input);
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const workflow = readFileSync(join(packageRoot, 'skills/landerpilot/references/promotion-site.md'), 'utf8');
    const text = result.content.filter((item: any) => item.type === 'text').map((item: any) => item.text).join('\n');
    expect(text).toContain(workflow.replaceAll('<plugin>', packageRoot));
    expect(text).not.toContain('<plugin>');
    expect(text).toContain('PartnerWhiz');
    expect(runtime.interactions).toEqual([]);
    expect(readdirSync(runtime.workspace)).toEqual(before);
    expect(runtime.reports).toContainEqual({ event: 'tool_finished', data: expect.objectContaining({ name: 'landerpilot_pw', outcome: 'completed' }) });
  });

  it('remembering guide never approves create; actual gate requests and honors denial before writes', async () => {
    const remembered = ruleFromApproval('landerpilot_pw', { operation: 'guide' }, Date.now());
    const runtime = await attach(packageRoot, [remembered]);
    expect(runtime.query('landerpilot_pw_create', { name: 'must-not-exist' })).toEqual({ kind: 'ask', dangerous: false });
    // Positive control: the real rule matcher can grant the exact write tool.
    expect(runtime.query('landerpilot_pw_create', {}, [ruleFromApproval('landerpilot_pw_create', {}, Date.now())])).toEqual({ kind: 'allow', source: 'rule' });
    const result = await invoke(runtime.session, 'landerpilot_pw_create', { name: 'must-not-exist' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('用户拒绝了 landerpilot_pw_create');
    expect(runtime.interactions.filter(event => event.kind === 'interaction-request')).toMatchObject([
      { toolName: 'landerpilot_pw_create', risk: 'write', rememberable: true },
    ]);
    expect(runtime.reports.filter(report => report.event === 'tool_finished')).toEqual([]);
    expect(existsSync(join(runtime.workspace, 'must-not-exist'))).toBe(false);
    expect(readdirSync(runtime.workspace)).toEqual([]);
  });

  it('the read-only guide cannot retain the old create operation', async () => {
    const runtime = await attach();
    const result = await invoke(runtime.session, 'landerpilot_pw', { operation: 'create', name: 'must-not-exist' });
    expect(result.isError).toBe(true);
    expect(readdirSync(runtime.workspace)).toEqual([]);
    expect(runtime.interactions).toEqual([]);
  });
});
