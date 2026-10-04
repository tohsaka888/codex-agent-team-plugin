import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orgForest, orgRoleView } from './web/org-view.mjs';

test('UE 职责按真实父分支归组，未回报职责的动态设计 Agent 保持独立', () => {
  const nodes = orgRoleView([
    { nativeAgentId: 'root', role: 'Coordinator' },
    { nativeAgentId: 'ue1', parentAgentId: 'root', role: 'ue' },
    { nativeAgentId: 'ue2', parentAgentId: 'root', role: 'UE' },
    { nativeAgentId: 'dynamic', parentAgentId: 'root', agentName: '/root/ui_design' },
  ]);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes.find((node) => node.role === 'UE').nativeAgentIds, ['ue1', 'ue2']);
  assert.equal(nodes.find((node) => node.nativeAgentId === 'dynamic').role, 'ui_design');
});

test('深层组织节点标识按路径线性增长', () => {
  const agents = Array.from({ length: 24 }, (_, i) => ({
    nativeAgentId: 'a' + i,
    parentAgentId: i ? 'a' + (i - 1) : null,
    role: 'Developer',
  }));
  const nodes = orgRoleView(agents);
  assert.equal(nodes.length, 24);
  assert.ok(nodes.every((n) => n.orgNodeId.length < 1000));
  assert.equal(new Set(nodes.map((n) => n.orgNodeId)).size, 24);
});

test('同父职责只展示一个组织节点，最近任务与历史保持真实实例关联', () => {
  const agents = [
    { nativeAgentId: 'root', role: 'Coordinator' },
    { nativeAgentId: 'old', parentAgentId: 'root', role: 'architect', lifecycle: 'stopped' },
    { nativeAgentId: 'new', parentAgentId: 'root', role: 'Architect', lifecycle: 'active' },
  ];
  const tasks = [
    { id: 't1', nativeAgentId: 'old', title: '旧方案', observedAt: '2026-10-02T01:00:00Z' },
    { id: 't2', nativeAgentId: 'new', title: '新方案', observedAt: '2026-10-02T02:00:00Z' },
  ];
  const nodes = orgRoleView(agents, tasks);
  assert.equal(nodes.length, 2);
  const role = nodes.find((n) => n.role === 'Architect');
  assert.equal(role.nativeAgentId, 'new');
  assert.equal(role.recentTask.id, 't2');
  assert.deepEqual(
    role.historyTasks.map((t) => t.id),
    ['t1'],
  );
  assert.deepEqual(role.members.map((a) => a.nativeAgentId).sort(), ['new', 'old']);
  assert.equal(role.activeCount, 1);
  assert.equal(orgForest(nodes).roots[0].children.length, 1);
});
test('Org Chart 展示真实父子边与未关联节点', () => {
  const view = orgForest([
    { nativeAgentId: 'root', parentAgentId: null, parentSessionId: null },
    { nativeAgentId: 'child', parentAgentId: 'root', parentSessionId: 'root' },
    { nativeAgentId: 'unknown', parentAgentId: null, parentSessionId: 'missing' },
  ]);
  assert.equal(view.roots.length, 1);
  assert.equal(view.roots[0].children[0].nativeAgentId, 'child');
  assert.equal(view.unlinked[0].nativeAgentId, 'unknown');
});
test('循环关系不画为真实树、不造成无限递归', () => {
  const view = orgForest([
    { nativeAgentId: 'a', parentAgentId: 'b' },
    { nativeAgentId: 'b', parentAgentId: 'a' },
  ]);
  assert.equal(view.roots.length, 0);
  assert.equal(view.unlinked.length, 2);
});
test('未知父级分支仍保留已核对后代', () => {
  const view = orgForest([
    { nativeAgentId: 'orphan', parentAgentId: 'missing' },
    { nativeAgentId: 'child', parentAgentId: 'orphan' },
  ]);
  assert.equal(view.unlinked.length, 1);
  assert.equal(view.unlinked[0].children[0].nativeAgentId, 'child');
});

test('并行同职责保留两个真实活动实例，最新任务换实例不改变组织节点', () => {
  const agents = [
    { nativeAgentId: 'root', role: 'Coordinator' },
    ...['a', 'b'].map((nativeAgentId) => ({
      nativeAgentId,
      parentAgentId: 'root',
      role: 'Developer',
      lifecycle: 'active',
    })),
  ];
  const tasks = [
    {
      id: 't1',
      nativeAgentId: 'a',
      executionStatus: 'running',
      observedAt: '2026-10-02T01:00:00Z',
    },
    {
      id: 't2',
      nativeAgentId: 'b',
      executionStatus: 'running',
      observedAt: '2026-10-02T02:00:00Z',
    },
  ];
  const before = orgRoleView(agents, tasks).find((n) => n.role === 'Developer');
  const after = orgRoleView(agents, [
    ...tasks,
    { id: 't3', nativeAgentId: 'a', observedAt: '2026-10-02T03:00:00Z' },
  ]).find((n) => n.role === 'Developer');
  assert.equal(before.activeCount, 2);
  assert.equal(before.nativeAgentId, 'b');
  assert.equal(after.nativeAgentId, 'a');
  assert.equal(before.orgNodeId, after.orgNodeId);
  assert.deepEqual(before.nativeAgentIds.sort(), ['a', 'b']);
});

test('不同父分支同职责、未知及循环实例不盲目合并，嵌套职责不自环', () => {
  const agents = [
    { nativeAgentId: 'root', role: 'Coordinator' },
    { nativeAgentId: 'a', parentAgentId: 'root', role: 'Architect' },
    { nativeAgentId: 'b', parentAgentId: 'a', role: 'Architect' },
    { nativeAgentId: 'orphan1', parentAgentId: 'missing', role: 'Reviewer' },
    { nativeAgentId: 'orphan2', parentAgentId: 'missing', role: 'Reviewer' },
    { nativeAgentId: 'x', parentAgentId: 'y', role: 'Developer' },
    { nativeAgentId: 'y', parentAgentId: 'x', role: 'Developer' },
    { nativeAgentId: 'unknown1', parentAgentId: 'root' },
    { nativeAgentId: 'unknown2', parentAgentId: 'root' },
  ];
  const nodes = orgRoleView(agents);
  assert.equal(nodes.length, 9);
  const forest = orgForest(nodes);
  assert.equal(forest.unlinked.length, 4);
  const a = forest.roots[0].children.find((n) => n.role === 'Architect');
  assert.equal(a.children[0].role, 'Architect');
  assert.notEqual(a.orgNodeId, a.children[0].orgNodeId);
});

test('明确未知职责不合并，历史父实例汇总后其子职责也只显示一节点', () => {
  const nodes = orgRoleView([
    { nativeAgentId: 'root', role: 'Coordinator' },
    { nativeAgentId: 'u1', parentAgentId: 'root', role: 'unknown' },
    { nativeAgentId: 'u2', parentAgentId: 'root', role: 'unknown' },
    { nativeAgentId: 'a1', parentAgentId: 'root', role: 'Architect' },
    { nativeAgentId: 'a2', parentAgentId: 'root', role: 'Architect' },
    { nativeAgentId: 'd1', parentAgentId: 'a1', role: 'Developer' },
    { nativeAgentId: 'd2', parentAgentId: 'a2', role: 'Developer' },
  ]);
  assert.equal(nodes.filter((n) => n.members.some((a) => a.role === 'unknown')).length, 2);
  assert.equal(nodes.length, 5);
  const developer = nodes.find((n) => n.role === 'Developer');
  assert.equal(developer.members.length, 2);
  const architect = orgForest(nodes).roots[0].children.find((n) => n.role === 'Architect');
  assert.equal(architect.children.length, 1);
  assert.equal(architect.children[0].role, 'Developer');
  assert.deepEqual(developer.relationEvidence, [
    { from: 'a1', to: 'd1' },
    { from: 'a2', to: 'd2' },
  ]);
});
