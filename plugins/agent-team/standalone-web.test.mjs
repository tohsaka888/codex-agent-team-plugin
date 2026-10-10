import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { startWebServer } from './web-server.mjs';
import { openWeb } from './open-web.mjs';
import { createSnapshotReader } from './web/sync-query.mjs';
import { initialBrowserSession } from './web/browser-scope.mjs';
import { appendOperation } from './skills/team-sync/scripts/tracking-core.mjs';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'agent-web-'));
  await appendOperation(
    { workspace: root },
    { kind: 'team', teamId: 'real-team', title: '真实回报团队' },
  );
  return root;
}
async function listen(server) {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return server.address().port;
}
const close = (server) => new Promise((done) => server.close(done));
test('独立分发包在无 MCP/Codex 安装、不同 cwd 中启动、读取真实事件并复用', async () => {
  const root = await fixture();
  await exec(process.execPath, [resolve(here, 'build.mjs'), '--web-only'], { cwd: tmpdir() });
  const deployment = resolve(root, 'portable-package');
  await cp(resolve(here, 'dist/web'), deployment, { recursive: true });
  assert.equal(
    (await readFile(resolve(deployment, 'package.json'), 'utf8')).includes('dependencies'),
    false,
  );
  const reserve = createServer();
  const port = await listen(reserve);
  await close(reserve);
  let pid;
  try {
    const result = await exec(
      process.execPath,
      [
        resolve(deployment, 'open-web.mjs'),
        '--workspace',
        root,
        '--team-id',
        'real-team',
        '--port',
        String(port),
        '--no-open',
      ],
      { cwd: tmpdir(), env: { ...process.env, CODEX_HOME: resolve(root, 'missing-codex') } },
    );
    const value = JSON.parse(result.stdout);
    assert.equal(new URL(value.url).searchParams.get('teamId'), 'real-team');
    const health = await (await fetch('http://127.0.0.1:' + port + '/api/health')).json();
    pid = health.pid;
    const state = await (
      await fetch('http://127.0.0.1:' + port + '/api/state?teamId=real-team')
    ).json();
    assert.equal(state.selectedRootSessionId, 'team:real-team');
    assert.equal(state.sessions[0].title, '真实回报团队');
    assert.equal(
      (await openWeb({ workspace: root, teamId: 'real-team', port, noOpen: true })).reused,
      true,
    );
    assert.equal((await fetch(value.url)).status, 200);
    await assert.rejects(openWeb({ workspace: tmpdir(), port, noOpen: true }), /占用/);
    await assert.rejects(
      openWeb({ workspace: root, dataDir: resolve(root, 'other-data'), port, noOpen: true }),
      /占用/,
    );
  } finally {
    if (pid) process.kill(pid);
  }
});
test('未知端口服务明确拒绝，查询参数不能覆盖服务的工作区和读取模式', async () => {
  const root = await fixture();
  const unknown = createServer((req, res) => res.end(JSON.stringify({ service: 'foreign' })));
  const port = await listen(unknown);
  try {
    await assert.rejects(openWeb({ workspace: root, port, noOpen: true }), /占用/);
  } finally {
    await close(unknown);
  }
  const server = await startWebServer({ workspace: root, port: 0 });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const state = await (
      await fetch(base + '/api/state?root=' + encodeURIComponent(tmpdir()) + '&portable=false')
    ).json();
    assert.equal(state.projects[0].path, root);
    assert.equal((await fetch(base + '/api/state?teamId=unknown')).status, 503);
    assert.equal((await fetch(base + '/api/state', { method: 'POST' })).status, 405);
  } finally {
    await close(server);
  }
});
test('独立服务产物预览保留任务/路径边界，执行记录不接入宿主', async () => {
  const root = await fixture();
  await writeFile(resolve(root, 'result.md'), '工作区内的结果');
  const config = { workspace: root };
  await appendOperation(config, {
    kind: 'task',
    teamId: 'real-team',
    taskId: '01',
    title: '只读产物',
    role: 'Developer',
    taskType: 'documentation',
    version: 'v1',
    acceptanceItems: [
      { id: 'file', label: '文件有效', method: 'read', verifier: 'agent', kind: 'check' },
    ],
  });
  await appendOperation(config, {
    kind: 'artifact',
    teamId: 'real-team',
    taskId: '01',
    artifactId: 'result',
    reference: 'result.md',
    label: '结果',
  });
  const server = await startWebServer({ workspace: root, port: 0 });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const query =
      '/api/artifact?' +
      new URLSearchParams({
        rootSessionId: 'team:real-team',
        taskId: JSON.stringify(['team', 'real-team', 'task', '01']),
        reference: 'result.md',
      });
    assert.equal((await (await fetch(base + query)).json()).content, '工作区内的结果');
    const execution = await (
      await fetch(base + query.replace('result.md', 'execution%3A%2F%2Fx'))
    ).json();
    assert.match(execution.error, /execution:\/\/ 不可用/);
    assert.equal((await fetch(base + query.replace('result.md', '..%2Foutside.md'))).status, 503);
  } finally {
    await close(server);
  }
});

test('已有宿主root的团队URL精确隔离共享root的其他团队，伪造服务身份拒绝复用', async () => {
  const root = await fixture();
  const config = { workspace: root };
  for (const teamId of ['A', 'B']) {
    await appendOperation(config, { kind: 'team', teamId, rootSessionId: 'host-root' });
    await appendOperation(config, {
      kind: 'task',
      teamId,
      taskId: '01',
      title: teamId,
      role: 'Developer',
      taskType: 'analysis',
      version: 'v1',
      acceptanceItems: [
        { id: 'check', label: 'scope', method: 'query', kind: 'check', verifier: 'agent' },
      ],
    });
  }
  const server = await startWebServer({ workspace: root, port: 0 });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const state = await (await fetch(base + '/api/state?teamId=A&rootSessionId=team:A')).json();
    const received = [],
      errors = [];
    const reader = createSnapshotReader({
      query: async (project, session) => {
        const query = new URLSearchParams({ teamId: 'A' });
        if (session) query.set('rootSessionId', session);
        return (await fetch(base + '/api/state?' + query)).json();
      },
      onSnapshot: (snapshot) => received.push(snapshot),
      onError: (error) => errors.push(error.message),
    });
    await reader.select(undefined, initialBrowserSession(new URLSearchParams('teamId=A')));
    await reader.request();
    assert.deepEqual(errors, []);
    assert.equal(received.length, 2);
    assert.deepEqual(
      received[1].snapshot.tasks.map((task) => task.teamId),
      ['A'],
    );
    assert.equal(state.selectedRootSessionId, 'host-root');
    assert.deepEqual(
      state.snapshot.tasks.map((task) => task.teamId),
      ['A'],
    );
    const previous = await (await fetch(base + '/api/state?rootSessionId=host-root')).json();
    assert.deepEqual(
      previous.snapshot.tasks.map((task) => task.teamId),
      ['A', 'B'],
    );
  } finally {
    await close(server);
  }
  const forged = createServer((req, res) =>
    res.end(
      JSON.stringify({
        service: 'agent-team-web',
        version: 1,
        workspace: root,
        dataDir: resolve(root, '.agent-team'),
        readOnly: true,
        pid: process.pid,
      }),
    ),
  );
  const port = await listen(forged);
  try {
    await assert.rejects(openWeb({ workspace: root, port, noOpen: true }), /实例身份/);
  } finally {
    await close(forged);
  }
});

test('源码启动器主页可用，环境数据目录与同步一致', async () => {
  const root = await fixture();
  const archive = resolve(root, 'environment-data');
  const previous = process.env.AGENT_TEAM_DATA_DIR;
  process.env.AGENT_TEAM_DATA_DIR = archive;
  const reserve = createServer();
  const port = await listen(reserve);
  await close(reserve);
  let pid;
  try {
    await appendOperation({ workspace: root }, { kind: 'team', teamId: 'env-team' });
    const result = await openWeb({ workspace: root, teamId: 'env-team', port, noOpen: true });
    const health = await (await fetch('http://127.0.0.1:' + port + '/api/health')).json();
    pid = health.pid;
    assert.equal(result.dataDir, archive);
    assert.equal((await fetch(result.url)).status, 200);
    const state = await (
      await fetch('http://127.0.0.1:' + port + '/api/state?teamId=env-team')
    ).json();
    assert.equal(state.sessions[0].teamId, 'env-team');
  } finally {
    if (pid) process.kill(pid);
    if (previous === undefined) delete process.env.AGENT_TEAM_DATA_DIR;
    else process.env.AGENT_TEAM_DATA_DIR = previous;
  }
});
