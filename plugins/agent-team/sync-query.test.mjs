import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotReader } from './web/sync-query.mjs';

test('原始本机项目 ID 接受明确映射的规范 ID，后续查询及断线缓存使用相同归属', async () => {
  const id = JSON.stringify(['local', 'project']),
    displayed = [],
    errors = [],
    queries = [];
  let online = true;
  const snapshot = {
    selectedProjectId: id,
    selectedRootSessionId: 'session',
    projects: [{ id, projectId: 'project', hostId: 'local' }],
  };
  const reader = createSnapshotReader({
    query: async (project, session) => {
      queries.push([project, session]);
      if (!online) throw Error('disconnected');
      return snapshot;
    },
    onSnapshot: (value) => displayed.push(value),
    onError: (error, context) => errors.push(context),
  });
  await reader.select('project', 'session');
  await reader.request();
  assert.equal(displayed.length, 2);
  assert.deepEqual(queries[1], [id, 'session']);
  online = false;
  await reader.select('project', 'session');
  assert.equal(errors[0].snapshot, snapshot);
});

test('项目别名不接受不同项目、跨主机、缺映射或不同会话的响应', async () => {
  const local = JSON.stringify(['local', 'project']),
    remote = JSON.stringify(['ssh', 'project']);
  for (const next of [
    { selectedProjectId: local, projects: [{ id: local, projectId: 'other', hostId: 'local' }] },
    { selectedProjectId: remote, projects: [{ id: remote, projectId: 'project', hostId: 'ssh' }] },
    { selectedProjectId: local, projects: [] },
    {
      selectedProjectId: local,
      selectedRootSessionId: 'other',
      projects: [{ id: local, projectId: 'project', hostId: 'local' }],
    },
    {
      selectedProjectId: remote,
      projects: [
        { id: local, projectId: 'project', hostId: 'local' },
        { id: remote, projectId: 'project', hostId: 'ssh' },
      ],
    },
  ]) {
    const displayed = [],
      errors = [];
    const reader = createSnapshotReader({
      query: async () => next,
      onSnapshot: (value) => displayed.push(value),
      onError: (error) => errors.push(error),
    });
    await reader.select('project', 'session');
    assert.equal(displayed.length, 0);
    assert.equal(errors.length, 1);
  }
});
test('同项目切换会话丢弃迟到响应，断线缓存不跨会话', async () => {
  let release;
  const displayed = [],
    errors = [];
  const reader = createSnapshotReader({
    query: (project, session) =>
      session === 'A'
        ? new Promise((resolve) => (release = resolve))
        : Promise.reject(new Error('B disconnected')),
    onSnapshot: (value) => displayed.push(value),
    onError: (error, context) => errors.push(context),
  });
  const pending = reader.select('project', 'A');
  await Promise.resolve();
  reader.select('project', 'B');
  release({ selectedProjectId: 'project', selectedRootSessionId: 'A' });
  await pending;
  assert.equal(displayed.length, 0);
  assert.equal(errors[0].rootSessionId, 'B');
  assert.equal(errors[0].snapshot, null);
});
test('切换 Workspace 后忽略旧响应，切换失败不冒用其他项目快照', async () => {
  const displayed = [],
    errors = [];
  let release;
  const reader = createSnapshotReader({
    query: (project) =>
      project === 'A'
        ? new Promise((resolve) => (release = resolve))
        : Promise.reject(new Error('B disconnected')),
    onSnapshot: (value) => displayed.push(value),
    onError: (error, context) => errors.push(context),
    isReady: () => true,
    isVisible: () => true,
  });
  const pending = reader.select('A');
  await Promise.resolve();
  reader.select('B');
  release({ selectedProjectId: 'A' });
  await pending;
  assert.equal(displayed.length, 0);
  assert.equal(errors[0].projectId, 'B');
  assert.equal(errors[0].snapshot, null);
});
test('断线只保留当前 Workspace 的成功快照，恢复读取新快照', async () => {
  let online = true;
  const errors = [],
    displayed = [];
  const reader = createSnapshotReader({
    query: async (project) => {
      if (!online || project === 'B') throw new Error('disconnected');
      return { selectedProjectId: project, revision: displayed.length + 1 };
    },
    onSnapshot: (value) => displayed.push(value),
    onError: (error, context) => errors.push(context),
  });
  await reader.select('A');
  await reader.select('B');
  assert.equal(errors[0].snapshot, null);
  online = false;
  await reader.select('A');
  assert.equal(errors[1].snapshot.revision, 1);
  online = true;
  await reader.request();
  assert.equal(displayed.at(-1).revision, 2);
});
test('握手就绪前及隐藏时不查询，恢复后读取最新 Workspace', async () => {
  let visible = true,
    ready = false,
    release;
  const queries = [];
  const reader = createSnapshotReader({
    query: (project) => {
      queries.push(project);
      return project === 'A'
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve({ selectedProjectId: project });
    },
    onSnapshot: () => {},
    onError: () => {},
    isVisible: () => visible,
    isReady: () => ready,
  });
  await reader.select('A');
  assert.deepEqual(queries, []);
  ready = true;
  const pending = reader.request();
  await Promise.resolve();
  reader.select('B');
  visible = false;
  release({ selectedProjectId: 'A' });
  await pending;
  assert.deepEqual(queries, ['A']);
  visible = true;
  await reader.request();
  assert.deepEqual(queries, ['A', 'B']);
});
