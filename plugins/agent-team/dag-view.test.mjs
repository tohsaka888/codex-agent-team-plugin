import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutDag, individualAgents, renderDagCard } from './web/dag-view.mjs';
import { layoutOrg } from './web/canvas-layout.mjs';

test('原生执行观察保留真实记录，普通未执行工单不伪造 run', () => {
  const graph = layoutDag([
    {
      id: 'observed',
      taskId: 'native-turn:turn',
      source: 'codex-host/native-turn',
      nativeAgentId: 'agent',
      executionStatus: 'running',
    },
    { id: 'planned', nativeAgentId: 'agent' },
  ]);
  assert.equal(graph.nodes.find((n) => n.task.cardKind === 'execution').runs.length, 1);
  assert.equal(
    graph.nodes.find((n) => n.task.cardKind === 'execution').runs[0].runId,
    'native-turn:turn',
  );
  assert.equal(graph.nodes.find((n) => n.task.id === 'planned').runs.length, 0);
});

test('DAG 保留全部执行与多前置汇合，每层共同居中', () => {
  const tasks = [
    { id: 'a', taskId: 'a', title: 'A', runs: [{ runId: 'a1' }, { runId: 'a2' }] },
    { id: 'b', taskId: 'b', title: 'B', runs: [] },
    { id: 'c', taskId: 'c', title: 'C', dependencies: ['a', 'b'], runs: [{ runId: 'c1' }] },
  ];
  const graph = layoutDag(tasks);
  assert.equal(graph.nodes.flatMap((n) => n.runs).length, 3);
  assert.equal(graph.edges.filter((e) => e.kind === 'dependency').length, 2);
  const c = graph.nodes.find((n) => n.task.id === 'c');
  assert.equal(c.x + c.width / 2, graph.width / 2);
  assert.equal(
    (graph.nodes.find((n) => n.task.id === 'a').x +
      graph.nodes.find((n) => n.task.id === 'b').x +
      graph.nodes.find((n) => n.task.id === 'b').width) /
      2,
    graph.width / 2,
  );
  assert.ok(c.y > graph.nodes[0].y + graph.nodes[0].height);
});

test('循环与缺失依赖明确诊断，不丢节点，不伪造 DAG 边', () => {
  const graph = layoutDag([
    { id: 'a', taskId: 'a', dependencies: ['b', 'missing'] },
    { id: 'b', taskId: 'b', dependencies: ['a'] },
    { id: 'c', taskId: 'c', dependencies: ['a'] },
  ]);
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.warnings.length, 2);
  assert.ok(graph.nodes.every((n) => n.unknown));
});

test('同职责真实 Agent 不合并，原生图完整历史不重叠，工单文字安全转义', () => {
  const agents = [
    { agentId: 'root', role: 'Coordinator' },
    { agentId: 'x', role: 'UE', parentAgentId: 'root' },
    { agentId: 'y', role: 'UE', parentAgentId: 'root' },
  ];
  const tasks = [
    {
      id: 't',
      taskId: 't',
      title: '<img onerror=alert(1)>',
      runs: Array.from({ length: 8 }, (_, i) => ({ agentId: 'root', runId: 'r' + i })),
    },
  ];
  const individuals = individualAgents(agents, tasks);
  assert.equal(individuals.length, 3);
  assert.equal(individuals[0].allRuns.length, 8);
  const tree = layoutOrg(individuals);
  assert.ok(tree.nodes[1].y > tree.nodes[0].y + tree.nodes[0].height);
  assert.equal(tree.edges.length, 2);
  const markup = renderDagCard(layoutDag(tasks).nodes[0]);
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  assert.equal(layoutDag(tasks).nodes.filter((n) => n.task.cardKind === 'execution').length, 8);
  assert.equal(layoutDag(tasks).edges.filter((e) => e.kind === 'membership').length, 8);
});

test('父工单五项分工独立节点，状态独立，归属与依赖分开', () => {
  const runs = Array.from({ length: 5 }, (_, i) => ({
    runId: 'run-' + i,
    title: '分工 ' + i,
    role: 'UE',
    executionStatus: i === 0 ? 'running' : 'completed',
  }));
  const graph = layoutDag([
    {
      id: 'parent',
      taskId: 'P1',
      title: '父任务',
      businessStatus: 'awaiting_review',
      runs: [...runs, runs[0]],
    },
  ]);
  assert.equal(graph.nodes.length, 6);
  const parent = graph.nodes.find((n) => n.task.cardKind === 'task');
  const executions = graph.nodes.filter((n) => n.task.cardKind === 'execution');
  assert.equal(graph.edges.length, 5);
  assert.ok(graph.edges.every((e) => e.kind === 'membership' && e.from === parent.orgNodeId));
  assert.equal(executions.filter((n) => n.task.executionStatus === 'completed').length, 4);
  assert.ok(renderDagCard(parent).includes('待评审'));
  executions.forEach((n, i) => {
    assert.equal(n.task.title, '分工 ' + i);
    assert.equal(n.task.parentTaskId, 'parent');
    assert.equal(n.task.id, JSON.stringify(['execution', 'parent', runs[i].runId]));
    assert.ok(renderDagCard(n).includes('Parent: P1'));
  });
});
