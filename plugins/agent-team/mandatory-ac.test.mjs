import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { acceptanceState } from './skills/team-sync/scripts/acceptance-contract.mjs';

test('旧人工交付对象不遮挡当前结果，新版仍需自己的确认', () => {
  const current = {
    id: 'current',
    itemId: 'delivery',
    type: 'delivery',
    version: 'v2',
    digest: 'new',
    acKey: 'ac',
    scopeKey: 'scope',
    resultDigest: 'new',
    resultVersion: 'v2',
  };
  const old = {
    ...current,
    id: 'old',
    version: 'v1',
    digest: 'old',
    resultDigest: 'old',
    resultVersion: 'v1',
  };
  const entity = {
    acKey: 'ac',
    resultDigest: 'new',
    resultVersion: 'v2',
    acceptanceItems: [{ id: 'delivery', verifier: 'human', kind: 'delivery' }],
    reviewRequirements: [old, current],
    reviewRecords: [
      {
        ...current,
        requirementId: 'current',
        authorType: 'human',
        decision: 'approved',
        quote: '确认当前版本',
      },
    ],
  };
  assert.equal(acceptanceState(entity).humanStatus, 'accepted');
  entity.reviewRecords = [
    { ...old, requirementId: 'old', authorType: 'human', decision: 'approved' },
  ];
  assert.equal(acceptanceState(entity).humanStatus, 'pending');
  entity.reviewRecords = [
    { ...current, requirementId: 'current', authorType: 'human', decision: 'rejected' },
  ];
  assert.equal(acceptanceState(entity).humanStatus, 'rejected');
});

const cli = fileURLToPath(new URL('./skills/team-sync/scripts/sync.mjs', import.meta.url));
test('已验收的失败历史执行可收尾，未验收或仍运行的执行仍阻止父卡完成', async (t) => {
  const f = await fixture(t),
    common = { teamId: 'ac', taskId: '01' };
  f.call('team', '--team-id', 'ac');
  await f.task({ acceptanceItems: ac().filter((i) => i.verifier === 'agent') });
  await f.write('run', {
    ...common,
    runId: 'history',
    provider: 'common',
    role: 'Reviewer',
    taskType: 'analysis',
    version: 'v1',
    acceptanceItems: ac().filter((i) => i.verifier === 'agent'),
    status: 'failed',
  });
  await writeFile(path.join(f.workspace, 'settled.md'), '父卡交付与历史失败报告均已核对');
  for (const runId of [null, 'history']) {
    const scope = { ...common, ...(runId ? { runId } : {}) };
    const digest = (await f.write('result', { ...scope, reference: 'settled.md', version: 'r1' }))
      .event.operation.digest;
    if (runId)
      await assert.rejects(f.write('task', { ...common, status: 'completed' }), /human acceptance/);
    await f.write('acceptance', {
      ...scope,
      itemId: 'test',
      status: 'passed',
      version: 'v1',
      digest,
      reportedBy: 'reviewer',
      evidence: '实际核对本卡结果；历史失败报告无未解决条件',
    });
    await f.write('review', {
      ...scope,
      reviewId: 'review',
      author: 'reviewer',
      authorType: 'agent',
      scope: 'delivery',
      decision: 'approved',
      version: 'r1',
      digest,
      evidence: '核对当前结果，历史失败保留',
    });
  }
  await f.write('run', { ...common, runId: 'history', status: 'running' });
  await assert.rejects(f.write('task', { ...common, status: 'completed' }), /human acceptance/);
  await f.write('run', { ...common, runId: 'history', status: 'failed' });
  await f.write('task', { ...common, status: 'completed' });
  assert.equal(f.call('read').runs[0].status, 'failed');
});
const ac = () => [
  {
    id: 'test',
    label: '回归单元测试覆盖新建和空条件拒绝且通过',
    method: 'node --test mandatory-ac.test.mjs',
    verifier: 'agent',
    kind: 'unit_test',
  },
  {
    id: 'delivery',
    label: '用户验收本卡实际交付与测试结果',
    method: '原生对话确认列明版本',
    verifier: 'human',
    kind: 'delivery',
    manualCheck: {
      entry: 'Agent Team 看板',
      steps: ['打开执行卡详情', '查看验收条件和验证证据'],
      expected: 'Agent 项有当前证据；人工项未确认前保持待验收',
    },
  },
];
async function fixture(t) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'mandatory-ac-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  return {
    workspace,
    call(kind, ...args) {
      return JSON.parse(
        execFileSync(process.execPath, [cli, kind, '--workspace', workspace, ...args], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    },
    async write(kind, body) {
      const filename = path.join(workspace, 'operation.json');
      await writeFile(filename, JSON.stringify(body));
      return this.call(kind, '--body-file', filename);
    },
    async task(overrides = {}) {
      return this.write('task', {
        teamId: 'ac',
        taskId: '01',
        title: '编码回归',
        role: 'Developer',
        taskType: 'code',
        version: 'v1',
        acceptanceItems: ac(),
        ...overrides,
      });
    },
  };
}
test('公开 CLI 拒绝空 AC 新任务且事件计数不变', async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'mandatory-ac-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const call = (kind, ...args) =>
    JSON.parse(
      execFileSync(process.execPath, [cli, kind, '--workspace', workspace, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  call('team', '--team-id', 'ac');
  assert.throws(
    () => call('task', '--team-id', 'ac', '--task-id', '01', '--title', '编码任务'),
    /AC|acceptanceItems/,
  );
  assert.equal(call('read').eventCount, 1);
  assert.equal(call('read').tasks.length, 0);
});

test('人工核验必须明确入口、操作步骤和预期结果，缺项或空泛占位拒绝写入', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  for (const manualCheck of [
    undefined,
    {},
    { entry: ' ', steps: ['查看页面'], expected: '正常' },
    { entry: 'Agent Team', steps: [], expected: '待评审' },
    { entry: 'Agent Team', steps: [' '], expected: '待评审' },
    { entry: 'Agent Team', steps: ['打开卡片'], expected: ' ' },
  ]) {
    await assert.rejects(
      f.task({ acceptanceItems: [ac()[0], { ...ac()[1], manualCheck }] }),
      /manualCheck|人工/,
    );
  }
  assert.equal(f.call('read').eventCount, 1);
  await f.task();
  const { projectTracking } = await import('./portable-state.mjs');
  const { renderChecklist } = await import('./web/trace-detail.mjs');
  const snapshot = f.call('read');
  const projected = projectTracking(snapshot, 'team:ac');
  assert.deepEqual(projected.tasks[0].acceptanceItems[1].manualCheck, ac()[1].manualCheck);
  assert.match(renderChecklist(projected.tasks[0]), /入口：Agent Team 看板/);
  assert.match(renderChecklist(projected.tasks[0]), /打开执行卡详情/);
  assert.match(renderChecklist(projected.tasks[0]), /预期结果：/);
});

test('原子创建具体 AC，拒绝空白、重复及 Developer 无单元测试', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  for (const items of [
    [],
    [{ ...ac()[0], label: ' ' }, ac()[1]],
    [ac()[0], { ...ac()[1], id: 'test' }],
    [{ ...ac()[0], kind: 'check' }, ac()[1]],
  ]) {
    await assert.rejects(f.task({ acceptanceItems: items }), /AC|acceptance|unit_test|label/);
  }
  await f.task();
  const snapshot = f.call('read');
  assert.equal(snapshot.eventCount, 2);
  assert.equal(snapshot.tasks[0].acceptanceItems.length, 2);
  assert.equal(snapshot.tasks[0].acceptanceItems[0].status, 'pending');
});

test('不需人工核验的分析卡只保留 Agent AC，验证与审查通过即可完成', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task({ role: 'Architect', taskType: 'analysis', acceptanceItems: [ac()[0]] });
  await writeFile(path.join(f.workspace, 'analysis.md'), '模块边界分析及引用核对完成');
  await f.write('result', { teamId: 'ac', taskId: '01', reference: 'analysis.md', version: 'r1' });
  const entity = f.call('read').tasks[0];
  await f.write('acceptance', {
    teamId: 'ac',
    taskId: '01',
    itemId: 'test',
    status: 'passed',
    evidence: '逐项核对模块接口与引用，未发现遗漏',
    reportedBy: 'architect',
    version: 'v1',
    digest: entity.resultDigest,
  });
  await f.write('review', {
    teamId: 'ac',
    taskId: '01',
    reviewId: 'final',
    author: 'reviewer',
    authorType: 'agent',
    scope: 'delivery',
    decision: 'approved',
    evidence: '独立核对分析与源码接口一致',
    version: 'r1',
    digest: entity.resultDigest,
  });
  await f.write('task', { teamId: 'ac', taskId: '01', status: 'completed' });
  const result = f.call('read').tasks[0];
  assert.equal(result.acceptance.accepted, true);
  assert.equal(result.acceptance.humanStatus, 'not_required');
  const { acceptanceSummary } = await import('./web/view-model.mjs');
  assert.match(acceptanceSummary(result), /无需人工核验/);
  const { renderHumanReview } = await import('./web/human-review-view.mjs');
  assert.match(renderHumanReview(result), /无需人工核验/);
});

test('执行卡 AC 独立且版本/证据不能跨 run，Agent 不能通过人工项', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  const run = (runId, extra = {}) =>
    f.write('run', {
      teamId: 'ac',
      taskId: '01',
      runId,
      provider: 'common',
      title: '回归核验',
      role: 'Developer',
      taskType: 'code',
      version: 'v1',
      acceptanceItems: ac(),
      ...extra,
    });
  await assert.rejects(run('empty', { acceptanceItems: [] }), /AC/);
  await run('a');
  await run('b');
  await writeFile(path.join(f.workspace, 'result.md'), '实际变更和测试结果 v1');
  await f.write('result', {
    teamId: 'ac',
    taskId: '01',
    runId: 'a',
    version: 'r1',
    reference: 'result.md',
  });
  const entity = f.call('read').runs.find((r) => r.runId === 'a');
  await f.write('acceptance', {
    teamId: 'ac',
    taskId: '01',
    runId: 'a',
    itemId: 'test',
    status: 'passed',
    evidence: 'node --test: 2/2 passed; mandatory-ac.test.mjs',
    reportedBy: 'developer',
    version: 'v1',
    digest: entity.resultDigest,
  });
  const snapshot = f.call('read');
  assert.equal(snapshot.runs.find((r) => r.runId === 'a').acceptance.items[0].status, 'passed');
  assert.equal(snapshot.runs.find((r) => r.runId === 'b').acceptance.items[0].status, 'pending');
  assert.equal(snapshot.tasks[0].acceptance.items[0].status, 'pending');
  await assert.rejects(
    f.write('acceptance', {
      teamId: 'ac',
      taskId: '01',
      runId: 'a',
      itemId: 'delivery',
      status: 'passed',
      evidence: 'Agent says yes',
      reportedBy: 'developer',
      version: 'v1',
      digest: entity.resultDigest,
    }),
    /human/,
  );
  await assert.rejects(
    f.write('acceptance', {
      teamId: 'ac',
      taskId: '01',
      runId: 'b',
      itemId: 'test',
      status: 'passed',
      evidence: 'copied',
      reportedBy: 'developer',
      version: 'v1',
      digest: entity.resultDigest,
    }),
    /result|version|digest/,
  );
});

test('业务完成需当前结果自主验证、独立审查和人工验收，变更/退回失效', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  const common = { teamId: 'ac', taskId: '01' };
  await assert.rejects(f.write('task', { ...common, status: 'awaiting_review' }), /verification/);
  await writeFile(path.join(f.workspace, 'result.md'), '交付 v1 与实测结果');
  await f.write('result', { ...common, reference: 'result.md', version: 'r1' });
  const digest = f.call('read').tasks[0].resultDigest;
  await f.write('acceptance', {
    ...common,
    itemId: 'test',
    status: 'passed',
    evidence: 'node --test: 3/3 passed; mandatory-ac.test.mjs',
    reportedBy: 'developer',
    version: 'v1',
    digest,
  });
  await f.write('task', { ...common, status: 'awaiting_review' });
  await assert.rejects(f.write('task', { ...common, status: 'completed' }), /human acceptance/);
  await f.write('review', {
    ...common,
    reviewId: 'agent1',
    author: 'reviewer',
    authorType: 'agent',
    scope: 'delivery',
    decision: 'approved',
    evidence: '核对实际代码/测试，无剩余问题',
    version: 'r1',
    digest,
  });
  await f.write('review-requirement', {
    ...common,
    requirementId: 'delivery',
    itemId: 'delivery',
    type: 'delivery',
    reference: 'result.md',
    version: 'r1',
  });
  const human = {
    ...common,
    reviewId: 'human1',
    author: '用户',
    authorType: 'human',
    reporterRole: 'coordinator',
    scope: 'delivery',
    decision: 'approved',
    quote: '确认本卡 r1 交付',
    evidence: '原生对话具体交付回复',
    requirementId: 'delivery',
    version: 'r1',
    digest,
  };
  await f.write('review', human);
  await f.write('task', { ...common, status: 'completed' });
  assert.equal(f.call('read').tasks[0].acceptance.accepted, true);
  await f.write('review', {
    ...human,
    reviewId: 'comment',
    decision: 'comment',
    quote: '补充备注',
  });
  assert.equal(f.call('read').tasks[0].acceptance.accepted, true);
  await f.write('review', {
    ...human,
    reviewId: 'reject',
    decision: 'rejected',
    quote: '退回：边界有问题',
  });
  assert.equal(f.call('read').tasks[0].acceptance.humanStatus, 'rejected');
  await assert.rejects(f.write('task', { ...common, status: 'completed' }), /human acceptance/);
  await f.write('review', { ...human, reviewId: 'human2' });
  await writeFile(path.join(f.workspace, 'result.md'), '未重新验收的新交付');
  assert.equal(f.call('read').tasks[0].acceptance.accepted, false);
  await assert.rejects(f.write('review', { ...human, reviewId: 'stale' }), /current AC and result/);
  await assert.rejects(f.write('task', { ...common, status: 'completed' }), /verification/);
});

test('真实同步快照到父卡/执行卡：执行结束待验收，条件与进度可见', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  await f.write('run', {
    teamId: 'ac',
    taskId: '01',
    runId: 'a',
    provider: 'common',
    title: '执行核验',
    role: 'Developer',
    taskType: 'code',
    version: 'v1',
    acceptanceItems: ac(),
  });
  f.call('run', '--team-id', 'ac', '--task-id', '01', '--run-id', 'a', '--status', 'completed');
  const { projectTracking } = await import('./portable-state.mjs');
  const { kanbanCards, taskColumn } = await import('./web/view-model.mjs');
  const { renderTaskCard } = await import('./web/cards-view.mjs');
  const { renderChecklist } = await import('./web/trace-detail.mjs');
  const { parseHTML } = await import('linkedom');
  const projected = projectTracking(f.call('read'), 'team:ac');
  const [parent, run] = kanbanCards(projected.tasks);
  assert.equal(parent.acceptanceItems.length, 2);
  assert.equal(run.acceptanceItems.length, 2);
  assert.equal(taskColumn(run), 'review');
  const { document } = parseHTML(
    '<html><body>' + renderTaskCard(run, null) + renderChecklist(run) + '</body></html>',
  );
  assert.match(document.body.textContent, /人工待验收/);
  assert.equal(document.querySelectorAll('.criterion').length, 2);
  assert.match(document.querySelector('.acceptance').textContent, /node --test/);
});

test('UE 执行原型未确认时阻止依赖分派和协调者直接开工，确认只覆盖当前对象', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task({ taskId: 'design', title: '设计父卡', role: 'Coordinator', taskType: 'analysis' });
  const proto = {
    id: 'prototype',
    label: '用户确认首页及窄屏原型 v1',
    method: '原生对话核对具体图和状态',
    verifier: 'human',
    kind: 'prototype',
    manualCheck: {
      entry: 'prototype.md 原型文件',
      steps: ['打开首页原型', '查看窄屏布局及页面 A/B 的状态'],
      expected: '确认页面范围内的布局和状态满足本次设计要求',
    },
  };
  await f.write('run', {
    teamId: 'ac',
    taskId: 'design',
    runId: 'ue',
    provider: 'common',
    role: 'UE',
    taskType: 'design',
    version: 'v1',
    acceptanceItems: [...ac(), proto],
  });
  await f.task({ dependencies: ['design'] });
  const implementation = {
    teamId: 'ac',
    taskId: '01',
    runId: 'dev',
    provider: 'common',
    role: 'Developer',
    taskType: 'code',
    version: 'v1',
    acceptanceItems: ac(),
  };
  await assert.rejects(f.write('run', implementation), /prototype/);
  await assert.rejects(
    f.write('task', { teamId: 'ac', taskId: '01', status: 'running' }),
    /prototype/,
  );
  await writeFile(path.join(f.workspace, 'prototype.md'), '首页与窄屏原型 v1');
  const requirement = (
    await f.write('review-requirement', {
      teamId: 'ac',
      taskId: 'design',
      runId: 'ue',
      requirementId: 'ui',
      itemId: 'prototype',
      type: 'ui',
      reference: 'prototype.md',
      version: 'p1',
      affectedTaskIds: ['design', '01'],
    })
  ).event.operation;
  await f.write('review', {
    teamId: 'ac',
    taskId: 'design',
    runId: 'ue',
    reviewId: 'user-ui',
    author: '用户',
    authorType: 'human',
    reporterRole: 'coordinator',
    scope: 'design',
    decision: 'approved',
    quote: '确认首页与窄屏 p1',
    evidence: '当前原型明确确认',
    requirementId: 'ui',
    version: 'p1',
    digest: requirement.digest,
  });
  await f.write('run', implementation);
  assert.equal(f.call('read').runs.find((r) => r.runId === 'ue').acceptance.humanReady, false);
  await writeFile(path.join(f.workspace, 'prototype.md'), '新增未确认页面');
  await assert.rejects(
    f.write('task', { teamId: 'ac', taskId: '01', status: 'running' }),
    /prototype/,
  );
});

test('父 AC 引用实质变化使执行证据失效，续派必须重新声明引用', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  await f.write('run', {
    teamId: 'ac',
    taskId: '01',
    runId: 'dev',
    provider: 'common',
    role: 'Developer',
    taskType: 'code',
    version: 'v1',
    acceptanceItems: [{ ...ac()[0], parentItemId: 'test', parentVersion: 'v1' }, ac()[1]],
  });
  await writeFile(path.join(f.workspace, 'result.md'), '真实执行结果');
  await f.write('result', {
    teamId: 'ac',
    taskId: '01',
    runId: 'dev',
    reference: 'result.md',
    version: 'r1',
  });
  const digest = f.call('read').runs[0].resultDigest;
  await f.write('acceptance', {
    teamId: 'ac',
    taskId: '01',
    runId: 'dev',
    itemId: 'test',
    status: 'passed',
    evidence: 'node --test: passed',
    reportedBy: 'developer',
    version: 'v1',
    digest,
  });
  assert.equal(f.call('read').runs[0].acceptance.agentReady, true);
  await f.task({ acceptanceItems: [{ ...ac()[0], label: '新增文件变更与边界验证' }, ac()[1]] });
  assert.equal(f.call('read').runs[0].acceptance.agentReady, false);
  await assert.rejects(
    f.write('run', { teamId: 'ac', taskId: '01', runId: 'dev', status: 'running' }),
    /parent|AC/,
  );
});

test('部分原型确认不能放行其他工单，扩展范围必须重新确认', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  const proto = {
    id: 'prototype',
    label: '两张页面候选原型',
    method: '用户核对页面范围',
    verifier: 'human',
    kind: 'prototype',
    manualCheck: {
      entry: 'prototype.md 原型文件',
      steps: ['打开首页原型', '查看窄屏布局及页面 A/B 的状态'],
      expected: '确认页面范围内的布局和状态满足本次设计要求',
    },
  };
  await f.task({
    taskId: 'design',
    role: 'UE',
    taskType: 'design',
    acceptanceItems: [...ac(), proto],
  });
  await f.task({ dependencies: ['design'] });
  await f.task({ taskId: '02', dependencies: ['design'] });
  await writeFile(path.join(f.workspace, 'prototype.md'), '页面 A/B 原型');
  const q = {
    teamId: 'ac',
    taskId: 'design',
    requirementId: 'ui',
    itemId: 'prototype',
    type: 'ui',
    reference: 'prototype.md',
    version: 'p1',
    affectedTaskIds: ['design', '01'],
  };
  const digest = (await f.write('review-requirement', q)).event.operation.digest;
  const human = {
    teamId: 'ac',
    taskId: 'design',
    reviewId: 'human',
    author: '用户',
    authorType: 'human',
    reporterRole: 'coordinator',
    scope: 'design',
    decision: 'approved',
    quote: '仅确认01首页',
    evidence: '原生对话部分确认',
    requirementId: 'ui',
    version: 'p1',
    digest,
  };
  await f.write('review', human);
  await f.write('task', { teamId: 'ac', taskId: '01', status: 'running' });
  await assert.rejects(
    f.write('task', { teamId: 'ac', taskId: '02', status: 'running' }),
    /prototype/,
  );
  await f.write('review-requirement', { ...q, affectedTaskIds: ['design', '01', '02'] });
  await assert.rejects(
    f.write('task', { teamId: 'ac', taskId: '02', status: 'running' }),
    /prototype/,
  );
  await f.write('review', { ...human, reviewId: 'human2', quote: '确认01和02的原型' });
  await f.write('task', { teamId: 'ac', taskId: '02', status: 'running' });
});

test('独立执行产物只在所属执行卡预览，不能越过父卡或兄弟卡关联', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  for (const runId of ['a', 'b'])
    await f.write('run', {
      teamId: 'ac',
      taskId: '01',
      runId,
      provider: 'common',
      role: 'Developer',
      taskType: 'code',
      version: 'v1',
      acceptanceItems: ac(),
    });
  await writeFile(path.join(f.workspace, 'proof.md'), '实际独立执行证据');
  await f.write('artifact', {
    teamId: 'ac',
    taskId: '01',
    runId: 'a',
    artifactId: 'proof',
    reference: 'proof.md',
  });
  const { projectTracking } = await import('./portable-state.mjs');
  const { kanbanCards } = await import('./web/view-model.mjs');
  const [parent, a, b] = kanbanCards(projectTracking(f.call('read'), 'team:ac').tasks);
  const { readArtifact } = await import('./artifact-reader.mjs');
  const context = {
    root: f.workspace,
    portable: true,
    rootSessionId: 'team:ac',
    reference: 'proof.md',
  };
  assert.equal((await readArtifact({ ...context, taskId: a.id })).content, '实际独立执行证据');
  await assert.rejects(readArtifact({ ...context, taskId: parent.id }), /未关联/);
  await assert.rejects(readArtifact({ ...context, taskId: b.id }), /未关联/);
});

test('重新声明父引用并重验后，旧人工验收和 Agent Review 不复活', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'ac');
  await f.task();
  const common = { teamId: 'ac', taskId: '01', runId: 'dev' };
  const definition = {
    ...common,
    provider: 'common',
    role: 'Developer',
    taskType: 'code',
    version: 'v1',
    acceptanceItems: [{ ...ac()[0], parentItemId: 'test', parentVersion: 'v1' }, ac()[1]],
  };
  await f.write('run', definition);
  await writeFile(path.join(f.workspace, 'result.md'), '真实代码和验证结果');
  await f.write('result', { ...common, reference: 'result.md', version: 'r1' });
  const first = f.call('read').runs[0];
  const digest = first.resultDigest;
  const verify = {
    ...common,
    itemId: 'test',
    status: 'passed',
    evidence: 'node --test: passed',
    reportedBy: 'developer',
    version: 'v1',
    digest,
  };
  await f.write('acceptance', verify);
  await f.write('review', {
    ...common,
    reviewId: 'agent',
    author: 'reviewer',
    authorType: 'agent',
    scope: 'delivery',
    decision: 'approved',
    evidence: '独立审查当前代码和测试',
    version: 'r1',
    digest,
  });
  const q = {
    ...common,
    requirementId: 'delivery',
    itemId: 'delivery',
    type: 'delivery',
    reference: 'result.md',
    version: 'r1',
  };
  await f.write('review-requirement', q);
  await f.write('review', {
    ...common,
    reviewId: 'human',
    author: '用户',
    authorType: 'human',
    reporterRole: 'coordinator',
    scope: 'delivery',
    decision: 'approved',
    quote: '确认dev当前r1',
    evidence: '原生对话明确确认',
    requirementId: 'delivery',
    version: 'r1',
    digest,
  });
  assert.equal(f.call('read').runs[0].acceptance.accepted, true);
  await f.task({ acceptanceItems: [{ ...ac()[0], label: '增加父卡风险验证' }, ac()[1]] });
  await f.write('run', definition);
  await f.write('acceptance', verify);
  await f.write('review-requirement', q);
  const refreshed = f.call('read').runs[0];
  assert.notEqual(refreshed.acKey, first.acKey);
  assert.equal(refreshed.acceptance.humanStatus, 'pending');
  assert.equal(refreshed.acceptance.reviewReady, false);
  assert.equal(refreshed.acceptance.accepted, false);
});

test('旧事件缺 AC 可读且明确待补，不能据执行结束追认或恢复开工', async (t) => {
  const f = await fixture(t);
  const team = f.call('team', '--team-id', 'ac').event;
  const scopes = await readdir(path.join(f.workspace, '.agent-team', 'workspaces'));
  const dir = path.join(f.workspace, '.agent-team', 'workspaces', scopes[0], 'events');
  const base = {
    protocolVersion: 1,
    workspace: team.workspace,
    revision: 1,
    producer: 'historical-fixture',
    timestamp: '2026-10-03T12:00:00.000Z',
    recordedAt: '2026-10-03T12:00:00.000Z',
  };
  await writeFile(
    path.join(dir, 'legacy-task.json'),
    JSON.stringify({
      ...base,
      eventId: 'old-task',
      sequence: 2,
      operation: {
        kind: 'task',
        teamId: 'ac',
        taskId: 'old',
        title: '历史工单',
        status: 'completed',
      },
    }),
  );
  await writeFile(
    path.join(dir, 'legacy-run.json'),
    JSON.stringify({
      ...base,
      eventId: 'old-run',
      sequence: 3,
      operation: {
        kind: 'run',
        teamId: 'ac',
        taskId: 'old',
        runId: 'old',
        provider: 'common',
        status: 'completed',
      },
    }),
  );
  const raw = f.call('read');
  assert.equal(raw.tasks[0].acceptance.missing, true);
  assert.equal(raw.runs[0].status, 'completed');
  const { projectTracking } = await import('./portable-state.mjs');
  const { kanbanCards, taskColumn, acceptanceSummary } = await import('./web/view-model.mjs');
  for (const card of kanbanCards(projectTracking(raw, 'team:ac').tasks)) {
    assert.equal(taskColumn(card), 'review');
    assert.match(acceptanceSummary(card), /AC 缺失/);
  }
  await assert.rejects(f.write('task', { teamId: 'ac', taskId: 'old', status: 'running' }), /AC/);
  assert.equal(f.call('read').eventCount, 3);
});
