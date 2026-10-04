import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readState } from './readonly-state.mjs';

test('默认会话优先明确输入和已核对调用环境，否则选进行中；工作区隔离且普通查询不自动绑定', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'session-selection-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const workspace = join(home, 'repo'),
    other = join(home, 'other');
  await mkdir(workspace);
  await mkdir(other);
  await mkdir(join(home, 'sessions'));
  const path = join(home, 'sessions', 'active.jsonl');
  await writeFile(
    path,
    [
      { type: 'session_meta', payload: { id: 'active' } },
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn' } },
      {
        type: 'event_msg',
        payload: { type: 'item_completed', thread_id: 'active', turn_id: 'turn' },
      },
    ]
      .map((x) => JSON.stringify({ ...x, timestamp: '2026-10-03T01:00:00Z' }))
      .join('\n'),
  );
  const db = new DatabaseSync(join(home, 'state_5.sqlite'));
  db.exec(
    'CREATE TABLE threads(id TEXT,cwd TEXT,name TEXT,source TEXT,updated_at INTEGER,archived INTEGER,rollout_path TEXT); CREATE TABLE thread_spawn_edges(parent_thread_id TEXT,child_thread_id TEXT)',
  );
  const put = db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?)');
  put.run('active', workspace, '进行中任务', 'vscode', 1000, 0, path);
  put.run('recent', workspace, '最近空闲任务', 'vscode', 2000, 0, null);
  put.run('child', workspace, null, 'vscode', 3000, 0, null);
  put.run('elsewhere', other, '其他项目任务', 'vscode', 4000, 0, null);
  db.prepare('INSERT INTO thread_spawn_edges VALUES(?,?)').run('recent', 'child');
  db.close();
  const options = {
    root: workspace,
    directory: join(home, 'events'),
    codexHome: home,
    registryPath: join(home, 'missing'),
    projectId: JSON.stringify(['local', workspace]),
  };
  assert.equal((await readState(options)).selectedRootSessionId, null);
  let state = await readState({ ...options, autoSelectSession: true });
  assert.equal(state.selectedRootSessionId, 'active');
  assert.equal(state.sessionSelectionSource, 'recent-active');
  state = await readState({ ...options, autoSelectSession: true, currentSessionId: 'child' });
  assert.equal(state.selectedRootSessionId, 'recent');
  assert.equal(state.sessionSelectionSource, 'invocation-environment');
  state = await readState({ ...options, autoSelectSession: true, currentSessionId: 'elsewhere' });
  assert.equal(state.selectedRootSessionId, 'active');
  state = await readState({
    ...options,
    autoSelectSession: true,
    currentSessionId: 'child',
    rootSessionId: 'active',
  });
  assert.equal(state.selectedRootSessionId, 'active');
  assert.equal(state.sessionSelectionSource, 'explicit');
  state = await readState({
    ...options,
    projectId: JSON.stringify(['local', other]),
    autoSelectSession: true,
  });
  assert.equal(state.selectedRootSessionId, 'elsewhere');
  assert.equal(state.sessionSelectionSource, 'recent-session');
  const desktopProjectId = JSON.stringify(['remote-ssh-discovered:AI', 'desktop-only-id']);
  state = await readState({
    ...options,
    projectId: desktopProjectId,
    rootSessionId: 'active',
    autoSelectSession: true,
  });
  assert.equal(state.selectedProjectId, options.projectId);
  assert.equal(state.selectedRootSessionId, 'active');
  assert.equal(state.projectSelectionSource, 'native-session');
  await assert.rejects(
    readState({ ...options, projectId: desktopProjectId, rootSessionId: 'active' }),
    /Workspace/,
  );
  await assert.rejects(
    readState({
      ...options,
      projectId: desktopProjectId,
      rootSessionId: 'missing',
      autoSelectSession: true,
    }),
    /Workspace/,
  );
});
