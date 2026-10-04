import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readState } from './readonly-state.mjs';
import { mergePortable } from './portable-state.mjs';
import { orgForest } from './web/org-view.mjs';

const cli = fileURLToPath(new URL('./skills/team-sync/scripts/sync.mjs', import.meta.url));
const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
function call(workspace, kind, ...args) {
  return JSON.parse(
    execFileSync(process.execPath, [cli, kind, '--workspace', workspace, ...args], {
      encoding: 'utf8',
    }),
  );
}

test('public CLI data is visible via standalone HTTP without Codex; scoped artifact previews are read only', async (t) => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'portable-http-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(resolve(workspace, 'proof.md'), 'actual proof');
  call(workspace, 'team', '--team-id', 'app', '--title', 'Independent App', '--provider', 'common');
  call(workspace, 'task', '--team-id', 'app', '--task-id', '01', '--title', 'Planned task');
  call(
    workspace,
    'artifact',
    '--team-id',
    'app',
    '--task-id',
    '01',
    '--artifact-id',
    'proof',
    '--reference',
    'proof.md',
  );
  const processHandle = spawn(
    process.execPath,
    [serverPath, '--http', '--portable', '--workspace', workspace],
    {
      env: {
        ...process.env,
        AGENT_TEAM_PREVIEW_PORT: '0',
        CODEX_HOME: resolve(workspace, 'no-codex'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  t.after(async () => {
    if (processHandle.exitCode === null) {
      processHandle.kill();
      await once(processHandle, 'exit');
    }
  });
  const base = await new Promise((accept, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('HTTP startup timeout: ' + output)), 10000);
    processHandle.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        accept(match[0]);
      }
    });
    processHandle.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    processHandle.on('exit', () => {
      clearTimeout(timeout);
      reject(new Error(output));
    });
  });
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.selectedRootSessionId, 'team:app');
  assert.equal(state.snapshot.tasks[0].businessStatus, 'queued');
  assert.equal(state.snapshot.agents.length, 0);
  const page = await (await fetch(base + '/')).text();
  assert.ok(page.includes('<script>') && !page.includes('<!-- BUNDLE -->'));
  const params = new URLSearchParams({
    projectId: state.selectedProjectId,
    rootSessionId: 'team:app',
    taskId: state.snapshot.tasks[0].id,
    reference: 'proof.md',
  });
  const proof = await (await fetch(base + '/api/artifact?' + params)).json();
  assert.equal(proof.content, 'actual proof');
  params.set('reference', '../outside.md');
  assert.equal((await fetch(base + '/api/artifact?' + params)).status, 503);
  assert.equal((await fetch(base + '/api/state', { method: 'POST' })).status, 405);
  const queried = await readState({ root: workspace, portable: true });
  assert.deepEqual(queried.snapshot.tasks, state.snapshot.tasks);
});

test('merging a synced Codex child preserves its observed parent and unsynced descendant', async (t) => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'portable-merge-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  call(workspace, 'team', '--team-id', 'app', '--root-session-id', 'root', '--provider', 'codex');
  call(workspace, 'task', '--team-id', 'app', '--task-id', '01', '--title', 'Task');
  call(
    workspace,
    'run',
    '--team-id',
    'app',
    '--task-id',
    '01',
    '--run-id',
    'dev',
    '--provider',
    'codex',
    '--native-agent-id',
    'child',
  );
  const state = {
    projects: [{ id: 'project', hostId: 'local', path: workspace }],
    selectedProjectId: 'project',
    selectedRootSessionId: 'root',
    sessions: [],
    snapshot: {
      tasks: [],
      agents: [
        { nativeAgentId: 'root' },
        { nativeAgentId: 'child', parentAgentId: 'root' },
        { nativeAgentId: 'grandchild', parentAgentId: 'child' },
      ],
      revision: 1,
    },
  };
  const merged = await mergePortable(state);
  const forest = orgForest(merged.snapshot.agents);
  assert.equal(forest.roots.length, 1);
  assert.equal(forest.unlinked.length, 0);
  assert.equal(forest.roots[0].children[0].children[0].nativeAgentId, 'grandchild');
});
