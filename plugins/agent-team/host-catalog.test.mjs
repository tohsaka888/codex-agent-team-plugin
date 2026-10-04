import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState } from './readonly-state.mjs';
import { readHostCatalog } from './host-catalog.mjs';
import { ingest, samePath } from './native-state.mjs';

test('无桌面注册表的服务器发现真实工作区、会话标题和跨cwd后代，数据库保持只读', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'host-catalog-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const a = join(home, 'Lyria'),
    b = join(home, 'hermes'),
    child = join(home, 'child');
  for (const p of [a, b, child]) await mkdir(p);
  const path = join(home, 'state_5.sqlite'),
    db = new DatabaseSync(path);
  db.exec(
    'CREATE TABLE threads(id TEXT,cwd TEXT,title TEXT,name TEXT,source TEXT,updated_at INTEGER,archived INTEGER); CREATE TABLE thread_spawn_edges(parent_thread_id TEXT,child_thread_id TEXT); CREATE TABLE projects(id TEXT,name TEXT,updated_at_ms INTEGER); CREATE TABLE project_roots(project_id TEXT,path TEXT,position INTEGER)',
  );
  const put = db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?)');
  put.run('root', a, '完整初始用户提示', '设计 Lyria', 'vscode', 1000, 0);
  put.run('other', b, '', null, 'vscode', 900, 0);
  put.run(
    'child',
    child,
    '',
    null,
    JSON.stringify({ subagent: { thread_spawn: { parent_thread_id: 'root' } } }),
    2000,
    0,
  );
  put.run('untitled', b, '短敏感初始提示', null, 'vscode', 800, 0);
  put.run('archived', a, '旧任务', '归档任务', 'vscode', 3000, 1);
  db.prepare('INSERT INTO thread_spawn_edges VALUES(?,?)').run('root', 'child');
  db.close();
  const names = new DatabaseSync(path);
  names.exec(
    "ALTER TABLE threads ADD COLUMN agent_nickname TEXT; UPDATE threads SET agent_nickname='mobile_analysis' WHERE id='child'",
  );
  names.close();
  await writeFile(
    join(home, 'session_index.jsonl'),
    'broken\n' +
      JSON.stringify({ id: 'other', thread_name: '旧名字' }) +
      '\n' +
      JSON.stringify({ id: 'other', thread_name: 'Hermes任务' }),
  );
  const before = await readFile(path);
  const catalog = await readHostCatalog(home);
  assert.equal(catalog.warning, null);
  assert.deepEqual(
    catalog.projects.map((p) => p.name),
    ['Lyria', 'hermes'],
  );
  assert.equal(catalog.threads.find((s) => s.id === 'other').title, 'Hermes任务');
  assert.equal(catalog.threads.find((s) => s.id === 'untitled').title, null);
  assert.equal(catalog.threads.find((s) => s.id === 'child').agentName, 'mobile_analysis');
  const directory = join(home, 'events');
  const state = await readState({
    root: join(home, 'plugin'),
    directory,
    codexHome: home,
    registryPath: join(home, 'missing'),
    rootSessionId: 'root',
  });
  assert.equal(state.projects.find((p) => p.id === state.selectedProjectId).path, a);
  assert.deepEqual(
    state.sessions.map((s) => s.id),
    ['root'],
  );
  assert.equal(state.sessions[0].title, '设计 Lyria');
  assert.equal(state.sessions[0].lastActivityAt, '1970-01-01T00:33:20.000Z');
  assert.equal(
    state.snapshot.agents.find((s) => s.nativeAgentId === 'child').parentAgentId,
    'root',
  );
  assert.ok(state.snapshot.agents.every((s) => s.lifecycle === 'unknown'));
  assert.deepEqual(state.snapshot.tasks, []);
  assert.equal(state.workspaceWarning, null);
  assert.deepEqual(await readFile(path), before);
  const other = await readState({
    root: a,
    directory,
    codexHome: home,
    registryPath: join(home, 'missing'),
    projectId: JSON.stringify(['local', b]),
    rootSessionId: 'root',
  });
  assert.deepEqual(other.snapshot.agents, []);
  assert.equal(other.snapshot.coverage, 'unobserved');
});

test('不可读宿主数据库明确降级，远程已观察会话不会被清空', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'catalog-errors-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await writeFile(join(home, 'state_5.sqlite'), 'damaged');
  const catalog = await readHostCatalog(home);
  assert.ok(catalog.warning);
  assert.deepEqual(catalog.threads, []);
  const registryPath = join(home, 'registry.json');
  await writeFile(
    registryPath,
    JSON.stringify({ 'remote-projects': [{ id: 'r', hostId: 'ssh', remotePath: '/repo' }] }),
  );
  const directory = join(home, 'events');
  await ingest(directory, {
    kind: 'host-observation',
    cwd: '/repo',
    hostId: 'ssh',
    sessionId: 'actual',
    source: 'codex-app/list_threads',
  });
  const state = await readState({
    root: home,
    directory,
    registryPath,
    projectId: JSON.stringify(['ssh', 'r']),
    rootSessionId: 'actual',
  });
  assert.equal(state.snapshot.coverage, 'partial');
  assert.equal(state.sessions[0].id, 'actual');
  assert.equal(state.snapshot.agents[0].nativeAgentId, 'actual');
});

test('Linux本执行环境路径区分大小写，空会话菜单有说明且收起时隐藏', async () => {
  if (process.platform !== 'win32') assert.equal(samePath('/repo/Lyria', '/repo/lyria'), false);
  else assert.equal(samePath('D:\\repo\\Lyria', '\\\\?\\D:\\repo\\Lyria'), true);
  const js = await readFile(new URL('./web/board.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('./web/polish.css', import.meta.url), 'utf8');
  assert.ok(js.includes('当前工作区暂无可选择的主会话'));
  assert.match(
    css,
    /\.session-picker:not\(\[open\]\) #session-options\s*\{\s*display:\s*none\s*;?\s*\}/,
  );
});
