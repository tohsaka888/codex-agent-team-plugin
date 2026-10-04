import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, copyFile, readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingest, readSnapshot } from './native-state.mjs';

test('技能回报脚本通过stdin写入插件展示目录，不写真实宿主会话', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'goal-report-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = join(root, 'plugins', 'agent-team');
  const script = join(plugin, 'skills', 'agent-team', 'scripts', 'report-goal.mjs');
  await mkdir(join(plugin, 'skills', 'agent-team', 'scripts'), { recursive: true });
  for (const file of [
    'native-state.mjs',
    'human-review.mjs',
    'traceability.mjs',
    'skills/agent-team/scripts/report-goal.mjs',
  ])
    await copyFile(new URL(file, import.meta.url), join(plugin, file));
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  child.stdin.end(
    JSON.stringify({
      cwd: root,
      sessionId: 'root',
      nativeAgentId: 'child',
      goal: '核对真实分派目标',
      goalOrigin: 'dispatch',
      reportedBy: '/root',
    }),
  );
  assert.equal(await completed, 0, output);
  const directory = join(root, '.runtime', 'native-team', 'events');
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  const event = JSON.parse(await readFile(join(directory, files[0]), 'utf8'));
  assert.equal(event.kind, 'task-goal-report');
  assert.equal(event.goal, '核对真实分派目标');
  assert.equal(event.nativeAgentId, 'child');
});

test('明确目标按父子身份补齐，后续更新不覆盖原生执行和验收状态', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'goal-report-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const directory = join(cwd, 'events');
  const workspace = { id: 'p', hostId: 'local', path: cwd };
  const nativeThreads = [
    { id: 'root', cwd, source: 'test', lastActivityAt: '2026-10-03T00:00:00Z' },
    {
      id: 'child',
      cwd,
      parentSessionId: 'root',
      agentName: '/root/mobile',
      source: 'test',
      dispatch: { at: '2026-10-03T00:00:00Z', goal: null, goalUnavailableReason: 'encrypted' },
      execution: { turnId: 'turn', status: 'completed', at: '2026-10-03T00:01:00Z' },
    },
  ];
  const snapshot = () =>
    readSnapshot(directory, workspace, { rootSessionId: 'root', nativeThreads });
  const report = {
    kind: 'task-goal-report',
    cwd,
    sessionId: 'root',
    nativeAgentId: 'child',
    goal: '完成移动端登录与验证',
    goalOrigin: 'dispatch',
    reportedBy: '/root',
  };
  await ingest(directory, report);
  let value = await snapshot();
  assert.equal(value.tasks.length, 1);
  const task = value.tasks[0];
  assert.equal(task.goal, report.goal);
  assert.equal(task.goalUnavailableReason, null);
  assert.equal(task.goalSource, 'native-coordinator/task-goal-report');
  assert.equal(task.goalReportedBy, '/root');
  assert.equal(task.executionStatus, 'completed');
  assert.equal(task.reviewPhase, 'unknown');
  assert.deepEqual(task.acceptanceItems, []);
  assert.equal(task.observedAt, '2026-10-03T00:01:00Z');
  await ingest(directory, { ...report, goal: '修正账号隔离并复测', goalOrigin: 'followup' });
  value = await snapshot();
  assert.equal(value.tasks[0].goal, '修正账号隔离并复测');
  assert.equal(value.tasks[0].goalOrigin, 'followup');
  assert.equal(value.tasks[0].id, task.id);
  assert.equal(value.tasks[0].executionStatus, 'completed');
  // 错父链、其他 Agent 和工作区不能覆盖已核对目标。
  for (const fields of [
    { sessionId: 'wrong' },
    { nativeAgentId: 'unobserved' },
    { cwd: join(cwd, 'other') },
  ])
    await ingest(directory, { ...report, ...fields, goal: '错误范围' });
  assert.equal((await snapshot()).tasks[0].goal, '修正账号隔离并复测');
  await ingest(directory, {
    ...report,
    goal: '工单核对目标',
    goalOrigin: 'linked-document',
    reference: 'docs/task.md',
  });
  assert.equal((await snapshot()).tasks[0].goalReference, 'docs/task.md');
  // 业务工单独立，不能被 Agent 级目标覆盖或产生重复卡片。
  await ingest(directory, {
    kind: 'task-report',
    cwd,
    sessionId: 'root',
    nativeAgentId: 'child',
    taskId: 'business',
    title: '业务工单',
    goal: '业务目标',
    executionStatus: 'blocked',
  });
  value = await snapshot();
  assert.equal(value.tasks.length, 1);
  assert.equal(value.tasks[0].goal, '业务目标');
  assert.equal(value.tasks[0].executionStatus, 'blocked');
  // 无原生分派/工单的目标回报不创建任务。
  assert.equal(
    (await readSnapshot(directory, workspace, { rootSessionId: 'root', nativeThreads: [] })).tasks
      .length,
    0,
  );
});

test('拒绝密文及不完整目标回报', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'goal-report-invalid-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const report = {
    kind: 'task-goal-report',
    cwd,
    sessionId: 'root',
    nativeAgentId: 'child',
    goal: '目标',
    goalOrigin: 'dispatch',
    reportedBy: '/root',
  };
  for (const fields of [
    { sessionId: null },
    { nativeAgentId: null },
    { goal: ' ' },
    { goal: 'gAAAAA' + 'x'.repeat(100) },
    { goal: 'x'.repeat(6001) },
    { reportedBy: null },
    { goalOrigin: 'guessed' },
    { goalOrigin: 'linked-document' },
  ])
    await assert.rejects(ingest(join(cwd, 'events'), { ...report, ...fields }));
});
