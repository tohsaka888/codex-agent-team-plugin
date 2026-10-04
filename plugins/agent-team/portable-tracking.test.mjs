import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { contractArgs, fixtureContract } from './test-contract-fixture.mjs';

const cli = fileURLToPath(new URL('./skills/team-sync/scripts/sync.mjs', import.meta.url));
async function fixture(t) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'portable-team-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  return {
    workspace,
    call(kind, ...args) {
      args = contractArgs(kind, args);
      return JSON.parse(
        execFileSync(process.execPath, [cli, kind, '--workspace', workspace, ...args], {
          encoding: 'utf8',
        }),
      );
    },
  };
}

test('公开run名称完整保存，状态更新保留名称并投影到工单执行', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'names');
  f.call('task', '--team-id', 'names', '--task-id', '01', '--title', '父工单');
  const args = ['--team-id', 'names', '--task-id', '01', '--run-id', 'r1'];
  f.call('run', ...args, '--provider', 'common', '--title', '独立审查', '--goal', '核验名称同步链');
  f.call('run', ...args, '--status', 'completed');
  const raw = f.call('read');
  assert.equal(raw.runs[0].title, '独立审查');
  const { projectTracking } = await import('./portable-state.mjs');
  const snapshot = projectTracking(raw, 'team:names');
  assert.equal(snapshot.tasks[0].runs[0].title, '独立审查');
});

test('late run summary cannot overwrite a newer activity across operation kinds', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', 'UI');
  const common = ['--team-id', 'alpha', '--task-id', 'ui', '--run-id', 'dev'];
  f.call(
    'run',
    ...common,
    '--provider',
    'common',
    '--native-role',
    'explorer',
    '--role',
    'Research',
    '--profile',
    'custom',
    '--timestamp',
    '2026-10-03T08:00:00Z',
  );
  f.call(
    'activity',
    ...common,
    '--summary',
    'fresh activity',
    '--timestamp',
    '2026-10-03T10:00:00Z',
  );
  f.call(
    'run',
    ...common,
    '--activity-summary',
    'old summary',
    '--status',
    'completed',
    '--timestamp',
    '2026-10-03T09:00:00Z',
  );
  assert.equal(f.call('read').runs[0].activitySummary, 'fresh activity');
  assert.equal(f.call('read').runs[0].nativeRole, 'explorer');
});

test('公开命令登记无执行实例工单并读取待开始任务', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha', '--title', 'English app');
  f.call(
    'task',
    '--team-id',
    'alpha',
    '--task-id',
    'ui',
    '--title',
    '移动学习界面',
    '--goal',
    '实现已确认界面',
  );
  const snapshot = f.call('read');
  assert.equal(snapshot.teams[0].title, 'English app');
  assert.equal(snapshot.tasks[0].status, 'queued');
  assert.equal(snapshot.tasks[0].goal, '实现已确认界面');
  assert.deepEqual(snapshot.runs, []);
});

test('任务贯通三个真实运行、业务退回与各自当前活动，拒绝非法宿主身份', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha', '--provider', 'codex', '--root-session-id', 'real-root');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', '界面');
  for (const [runId, role] of [
    ['dev', 'developer'],
    ['review', 'reviewer'],
    ['repair', 'developer'],
  ]) {
    f.call(
      'run',
      '--team-id',
      'alpha',
      '--task-id',
      'ui',
      '--run-id',
      runId,
      '--provider',
      'codex',
      '--native-agent-id',
      `observed-${runId}`,
      '--role',
      role,
      '--agent-name',
      runId,
      '--profile',
      role,
    );
    f.call(
      'activity',
      '--team-id',
      'alpha',
      '--task-id',
      'ui',
      '--run-id',
      runId,
      '--summary',
      `${runId} 在工作`,
    );
    f.call(
      'run',
      '--team-id',
      'alpha',
      '--task-id',
      'ui',
      '--run-id',
      runId,
      '--status',
      'completed',
    );
  }
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--status', 'repair_required');
  const snapshot = f.call('read');
  assert.equal(snapshot.tasks[0].status, 'repair_required');
  assert.equal(snapshot.runs.length, 3);
  assert.equal(
    snapshot.runs.find((run) => run.runId === 'review').activitySummary,
    'review 在工作',
  );
  const body = path.join(f.workspace, 'invalid.json');
  await writeFile(
    body,
    JSON.stringify({
      teamId: 'alpha',
      taskId: 'ui',
      runId: 'invalid',
      provider: 'codex',
      nativeAgentId: { invented: true },
    }),
  );
  assert.throws(() => f.call('run', '--body-file', body), /nativeAgentId/);
});

test('checklist逐项合并失败和通过，记录的通过证据不能被任意命令伪造', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', '界面');
  const common = ['--team-id', 'alpha', '--task-id', 'ui'];
  await writeFile(path.join(f.workspace, 'result.md'), '实际布局和键盘核对结果');
  const result = f.call('result', ...common, '--reference', 'result.md', '--version', 'r1').event
    .operation;
  const verification = ['--version', 'v1', '--digest', result.digest];
  f.call(
    'acceptance',
    ...common,
    '--item-id',
    'layout',
    '--label',
    '四列布局',
    '--status',
    'pending',
  );
  f.call(
    'acceptance',
    ...common,
    '--item-id',
    'keyboard',
    '--label',
    '键盘导航',
    '--status',
    'pending',
  );
  f.call(
    'acceptance',
    ...common,
    '--item-id',
    'layout',
    '--status',
    'failed',
    ...verification,
    '--evidence',
    '桌面截图中布局变成纵排',
    '--reported-by',
    'reviewer',
  );
  f.call(
    'acceptance',
    ...common,
    '--item-id',
    'layout',
    '--status',
    'passed',
    ...verification,
    '--evidence',
    '重新核对1440px截图为四列',
    '--reported-by',
    'reviewer',
  );
  assert.throws(
    () => f.call('acceptance', ...common, '--item-id', 'keyboard', '--status', 'passed'),
    /evidence/,
  );
  const items = f.call('read').tasks[0].acceptanceItems;
  assert.equal(items.find((item) => item.id === 'layout').status, 'passed');
  assert.equal(items.find((item) => item.id === 'layout').label, '四列布局');
  assert.equal(items.find((item) => item.id === 'keyboard').status, 'pending');
  // 非验收命令不能向验收表注入结构化结果。
  const body = path.join(f.workspace, 'spoof.json');
  await writeFile(
    body,
    JSON.stringify({
      teamId: 'alpha',
      taskId: 'ui',
      acceptanceItems: [{ id: 'keyboard', status: 'passed' }],
    }),
  );
  assert.throws(() => f.call('task', '--body-file', body), /AC definitions/);
});

test('幂等重试、显式晚到修订及跨团队工单隔离', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('team', '--team-id', 'beta');
  const command = [
    '--team-id',
    'alpha',
    '--task-id',
    'same',
    '--title',
    '新版',
    '--revision',
    '3',
    '--event-id',
    'create-alpha',
  ];
  const first = f.call('task', ...command);
  const retry = f.call('task', ...command);
  assert.equal(retry.duplicate, true);
  assert.equal(first.eventId, retry.eventId);
  assert.throws(() => f.call('task', ...command, '--goal', '冲突内容'), /different content/);
  f.call(
    'task',
    '--team-id',
    'alpha',
    '--task-id',
    'same',
    '--title',
    '旧版晚到',
    '--revision',
    '1',
  );
  f.call('task', '--team-id', 'beta', '--task-id', 'same', '--title', '另一团队');
  const snapshot = f.call('read');
  assert.equal(snapshot.tasks.find((task) => task.teamId === 'alpha').title, '新版');
  assert.equal(snapshot.tasks.find((task) => task.teamId === 'beta').title, '另一团队');
  assert.equal(snapshot.eventCount, 5);
  assert.throws(
    () =>
      f.call(
        'task',
        '--team-id',
        'alpha',
        '--task-id',
        'same',
        '--title',
        '同修订冲突',
        '--revision',
        '3',
      ),
    /revision already exists/,
  );
});

test('人工评审只匹配真实文件版本与指纹，保存旧版快照及部分确认', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', '界面');
  const common = ['--team-id', 'alpha', '--task-id', 'ui'];
  await writeFile(path.join(f.workspace, 'design.md'), 'abc');
  await writeFile(path.join(f.workspace, 'spec.md'), 'spec v1');
  const first = f.call(
    'review-requirement',
    ...common,
    '--requirement-id',
    'design',
    '--type',
    'visual',
    '--item-id',
    'prototype',
    '--reference',
    'design.md',
    '--version',
    'v1',
  ).event.operation;
  assert.equal(first.digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  f.call(
    'review-requirement',
    ...common,
    '--requirement-id',
    'spec',
    '--type',
    'spec',
    '--reference',
    'spec.md',
    '--version',
    'v1',
  );
  const review = [
    '--review-id',
    'user-design-v1',
    '--author',
    '用户',
    '--author-type',
    'human',
    '--decision',
    'approved',
    '--evidence',
    '主会话本轮用户原始回复',
    '--quote',
    '确认这个设计v1',
    '--reporter-role',
    'coordinator',
    '--requirement-id',
    'design',
    '--version',
    'v1',
    '--digest',
    first.digest,
  ];
  f.call('review', ...common, ...review);
  let task = f.call('read').tasks[0];
  assert.equal(task.reviewRequirements.length, 2);
  assert.equal(task.reviewRecords.length, 1);
  await writeFile(path.join(f.workspace, 'design.md'), 'changed design v2');
  f.call(
    'review-requirement',
    ...common,
    '--requirement-id',
    'design',
    '--type',
    'visual',
    '--item-id',
    'prototype',
    '--reference',
    'design.md',
    '--version',
    'v2',
  );
  task = f.call('read').tasks[0];
  assert.notEqual(
    task.reviewRequirements.find((item) => item.id === 'design').digest,
    first.digest,
  );
  assert.equal(task.reviewRecords[0].version, 'v1');
  assert.equal(await readFile(first.snapshotReference, 'utf8'), 'abc');
  assert.equal(
    task.reviewRequirements.find((item) => item.id === 'design').history[0].version,
    'v1',
  );
  assert.throws(
    () => f.call('review', ...common, ...review, '--review-id', 'stale-approval'),
    /current requirement/,
  );
  assert.throws(
    () => f.call('artifact', ...common, '--artifact-id', 'outside', '--reference', '../outside.md'),
    /outside workspace/,
  );
});

test('执行身份不可重绑定、父关系无环，评审和产物不能关联别的工单运行', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  for (const taskId of ['one', 'two'])
    f.call('task', '--team-id', 'alpha', '--task-id', taskId, '--title', taskId);
  const common = ['--team-id', 'alpha', '--task-id', 'one'];
  f.call(
    'run',
    ...common,
    '--run-id',
    'a',
    '--provider',
    'codex',
    '--native-agent-id',
    'observed-a',
  );
  f.call('run', ...common, '--run-id', 'b', '--provider', 'codex', '--parent-run-id', 'a');
  f.call(
    'run',
    '--team-id',
    'alpha',
    '--task-id',
    'two',
    '--run-id',
    'other',
    '--provider',
    'claude',
  );
  assert.throws(
    () => f.call('run', ...common, '--run-id', 'a', '--provider', 'claude'),
    /cannot change/,
  );
  assert.throws(
    () => f.call('run', ...common, '--run-id', 'a', '--native-agent-id', 'invented-b'),
    /cannot change/,
  );
  assert.throws(() => f.call('run', ...common, '--run-id', 'a', '--parent-run-id', 'b'), /cycle/);
  assert.throws(
    () =>
      f.call(
        'review',
        ...common,
        '--run-id',
        'other',
        '--review-id',
        'wrong',
        '--author',
        'reviewer',
        '--author-type',
        'agent',
        '--decision',
        'approved',
        '--evidence',
        '检查输出',
      ),
    /runId.*task/,
  );
  await writeFile(path.join(f.workspace, 'file.md'), 'abc');
  assert.throws(
    () =>
      f.call(
        'artifact',
        ...common,
        '--run-id',
        'other',
        '--artifact-id',
        'wrong',
        '--reference',
        'file.md',
      ),
    /runId.*task/,
  );
  assert.throws(
    () =>
      f.call(
        'review-requirement',
        ...common,
        '--requirement-id',
        'invalid',
        '--reference',
        'file.md',
        '--version',
        'v1',
        '--type',
        'unsupported',
      ),
    /requirement type/,
  );
});

test('新活动刷新运行时间，晚到执行状态不能倒退活动新鲜度', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', '界面');
  const common = ['--team-id', 'alpha', '--task-id', 'ui', '--run-id', 'a'];
  f.call('run', ...common, '--provider', 'codex', '--timestamp', '2020-01-01T00:00:00Z');
  f.call('activity', ...common, '--summary', '当前检查布局', '--timestamp', '2026-10-03T10:00:00Z');
  f.call('run', ...common, '--status', 'completed', '--timestamp', '2026-10-03T09:00:00Z');
  const snapshot = f.call('read');
  assert.equal(snapshot.runs[0].updatedAt, '2026-10-03T10:00:00Z');
  assert.equal(snapshot.runs[0].activitySummary, '当前检查布局');
  assert.ok(Date.parse(snapshot.lastEventAt) >= Date.parse('2026-10-03T09:00:00Z'));
});

test('并发公开命令完整落盘、UTF8 BOM正文可读且无插件依赖', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  const body = path.join(f.workspace, 'body.json');
  await writeFile(
    body,
    '\uFEFF' +
      JSON.stringify({
        ...fixtureContract(),
        teamId: 'alpha',
        taskId: 'body',
        title: 'BOM正文标题',
        goal: '多行\n目标',
      }),
  );
  f.call('task', '--body-file', body, '--title', 'CLI覆盖标题');
  const asyncExec = promisify(execFile);
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      asyncExec(process.execPath, [
        cli,
        'task',
        ...contractArgs('task', ['--title', `工单${index}`]),
        '--workspace',
        f.workspace,
        '--team-id',
        'alpha',
        '--task-id',
        `parallel-${index}`,
        '--title',
        `工单${index}`,
      ]),
    ),
  );
  const snapshot = f.call('read');
  assert.equal(snapshot.tasks.length, 9);
  assert.equal(snapshot.eventCount, 10);
  assert.equal(snapshot.tasks.find((task) => task.taskId === 'body').title, 'CLI覆盖标题');
  assert.equal(snapshot.tasks.find((task) => task.taskId === 'body').goal, '多行\n目标');
});

test('共享data-dir隔离工作区并拒绝符号链接越界文件', async (t) => {
  const f = await fixture(t);
  const other = await fixture(t);
  const dataDir = path.join(f.workspace, 'shared-data');
  for (const entry of [f, other]) {
    entry.call('team', '--team-id', 'alpha', '--data-dir', dataDir, '--event-id', 'team-alpha');
    entry.call(
      'task',
      '--team-id',
      'alpha',
      '--task-id',
      'same',
      '--title',
      entry === f ? '本工作区' : '其他工作区',
      '--data-dir',
      dataDir,
      '--event-id',
      'task-same',
    );
  }
  assert.equal(f.call('read', '--data-dir', dataDir).tasks[0].title, '本工作区');
  assert.equal(other.call('read', '--data-dir', dataDir).tasks[0].title, '其他工作区');
  await writeFile(path.join(other.workspace, 'secret.md'), 'outside');
  await symlink(
    other.workspace,
    path.join(f.workspace, 'external-link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(
    () =>
      f.call(
        'artifact',
        '--team-id',
        'alpha',
        '--task-id',
        'same',
        '--artifact-id',
        'outside',
        '--reference',
        'external-link/secret.md',
        '--data-dir',
        dataDir,
      ),
    /symlink is outside workspace/,
  );
  assert.equal(f.call('read', '--data-dir', dataDir).eventCount, 2);
});

test('产物关联不同运行时，旧修订不能覆盖工单当前产物', async (t) => {
  const f = await fixture(t);
  f.call('team', '--team-id', 'alpha');
  f.call('task', '--team-id', 'alpha', '--task-id', 'ui', '--title', '界面');
  const common = ['--team-id', 'alpha', '--task-id', 'ui'];
  for (const runId of ['dev', 'repair'])
    f.call('run', ...common, '--run-id', runId, '--provider', 'codex');
  await writeFile(path.join(f.workspace, 'design.md'), 'abc');
  f.call(
    'artifact',
    ...common,
    '--artifact-id',
    'design',
    '--run-id',
    'repair',
    '--reference',
    'design.md',
    '--label',
    '修正后的设计',
    '--revision',
    '2',
  );
  f.call(
    'artifact',
    ...common,
    '--artifact-id',
    'design',
    '--run-id',
    'dev',
    '--reference',
    'design.md',
    '--label',
    '旧设计',
    '--revision',
    '1',
  );
  const snapshot = f.call('read');
  assert.equal(snapshot.runs.find((r) => r.runId === 'repair').artifacts[0].label, '修正后的设计');
  assert.equal(snapshot.runs.find((r) => r.runId === 'dev').artifacts[0].label, '旧设计');
  assert.equal(snapshot.tasks[0].artifacts.length, 0);
});
