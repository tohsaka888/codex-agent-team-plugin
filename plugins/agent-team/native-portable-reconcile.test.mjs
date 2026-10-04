import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergePortable, reconcileNativeRuns, projectTracking } from './portable-state.mjs';
import { appendOperation, readTracking } from './skills/team-sync/scripts/tracking-core.mjs';
import { taskColumn } from './web/view-model.mjs';
import { taskState } from './web/task-presentation.mjs';
import { orgRoleView, orgForest } from './web/org-view.mjs';
import { fixtureContract } from './test-contract-fixture.mjs';

const time = (n) => `2026-10-03T12:${n}:00.000Z`;
function fixture() {
  return {
    teams: [{ teamId: 'app', title: 'App', rootSessionId: 'root', provider: 'codex' }],
    tasks: [
      { teamId: 'app', taskId: 'ux', title: 'UX', status: 'running' },
      { teamId: 'app', taskId: 'next', title: 'Next', dependencies: ['ux'] },
    ],
    runs: [
      {
        teamId: 'app',
        taskId: 'ux',
        runId: 'ux-1',
        provider: 'codex',
        agentName: '/root/ux_inventory',
        status: 'running',
        updatedAt: time('30'),
      },
    ],
  };
}
function snapshot() {
  return {
    agents: [
      { nativeAgentId: 'root' },
      {
        nativeAgentId: 'actual',
        parentSessionId: 'root',
        parentAgentId: 'root',
        agentName: '/root/ux_inventory',
        agentNameSource: 'codex-host/sqlite',
      },
    ],
    tasks: [
      {
        id: 'native',
        nativeAgentId: 'actual',
        source: 'codex-host/native-turn',
        executionStatus: 'completed',
        observedAt: time('36'),
        activityAt: time('36'),
        activitySummary: 'Finished',
      },
    ],
  };
}

test('unique full native path merges duplicate card and fresh execution without completing business dependencies', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'reconcile-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const raw = fixture();
  for (const [kind, values] of [
    ['team', raw.teams],
    ['task', raw.tasks],
    ['run', raw.runs],
  ])
    for (const value of values)
      await appendOperation(
        { workspace },
        {
          ...(['task', 'run'].includes(kind) ? fixtureContract() : {}),
          ...value,
          updatedAt: undefined,
          kind,
          timestamp: time('30'),
        },
      );
  const before = await readTracking({ workspace });
  const merged = await mergePortable({
    projects: [{ id: 'p', hostId: 'local', path: workspace }],
    selectedProjectId: 'p',
    selectedRootSessionId: 'root',
    sessions: [],
    snapshot: snapshot(),
  });
  assert.equal(merged.snapshot.tasks.length, 2);
  const task = merged.snapshot.tasks.find((x) => x.taskId === 'ux');
  assert.equal(task.nativeAgentId, 'actual');
  assert.equal(task.businessStatus, 'running');
  assert.equal(task.executionStatus, 'completed');
  assert.equal(taskColumn(task), 'completed');
  assert.match(taskState(task), /本轮执行完成.*业务进行中/);
  assert.equal(merged.snapshot.tasks.find((x) => x.taskId === 'next').businessStatus, 'blocked');
  assert.deepEqual(await readTracking({ workspace }), before);
});

test('activity freshness does not hide native completion; only latest run receives observed execution', () => {
  const raw = fixture(),
    native = snapshot();
  const run = raw.runs[0];
  run.nativeAgentId = 'actual';
  run.updatedAt = time('40');
  run.statusUpdatedAt = time('30');
  run.activitySummary = 'Evidence posted after execution';
  run.activitySummaryAt = time('40');
  raw.runs.unshift({
    ...run,
    runId: 'old',
    updatedAt: time('20'),
    statusUpdatedAt: time('20'),
    status: 'failed',
  });
  native.agents[1].nativeExecution = { status: 'completed', at: time('36') };
  native.tasks = [];
  const merged = reconcileNativeRuns(raw, native, 'root');
  assert.equal(merged.runs[0].status, 'failed');
  assert.equal(merged.runs[1].status, 'completed');
  assert.equal(merged.runs[1].activitySummary, run.activitySummary);
  assert.equal(raw.runs[1].status, 'running');
});

test('observed team root joins Coordinator run; task provenance survives later status reports and org has no duplicate nodes', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'root-provenance-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const append = (input) =>
    appendOperation(
      { workspace },
      {
        ...(['task', 'run'].includes(input.kind) && (input.title || input.provider)
          ? fixtureContract()
          : {}),
        producer: 'coordinator',
        timestamp: time('30'),
        ...input,
      },
    );
  await append({
    kind: 'team',
    teamId: 'app',
    title: 'App',
    provider: 'codex',
    rootSessionId: 'root',
  });
  const goalEvent = await append({
    kind: 'task',
    teamId: 'app',
    taskId: 'visual',
    title: 'Visual',
    role: 'Coordinator / UE',
    goal: 'Generate confirmed visuals',
  });
  await append({
    kind: 'run',
    teamId: 'app',
    taskId: 'visual',
    runId: 'root-1',
    provider: 'codex',
    agentName: '/root',
    role: 'Coordinator / UE',
    activitySummary: 'Awaiting user feedback',
  });
  await append({
    kind: 'task',
    teamId: 'app',
    taskId: 'visual',
    status: 'running',
    timestamp: time('40'),
    producer: 'later-reporter',
  });
  const original = await readTracking({ workspace });
  const native = snapshot();
  native.agents = [native.agents[0]];
  native.tasks = [];
  const state = await mergePortable({
    projects: [{ id: 'p', hostId: 'local', path: workspace }],
    selectedProjectId: 'p',
    selectedRootSessionId: 'root',
    sessions: [],
    snapshot: native,
  });
  assert.equal(state.snapshot.agents.length, 1);
  const task = state.snapshot.tasks[0];
  assert.equal(task.nativeAgentId, 'root');
  assert.equal(task.goalReportedBy, 'coordinator');
  assert.equal(task.goalReportedAt, time('30'));
  assert.ok(task.goalReference.includes(goalEvent.eventId));
  assert.equal(task.activitySource, 'team-sync/run');
  assert.equal(task.agentNameSource, 'team-sync/run');
  assert.equal(task.identitySource, 'team-sync/root-session/matched-observed-agent');
  const nodes = orgRoleView(state.snapshot.agents, state.snapshot.tasks);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].role, 'UE');
  assert.equal(task.reportedRole, 'Coordinator / UE');
  assert.equal(nodes[0].recentTask.taskId, 'visual');
  assert.equal(orgForest(nodes).roots.length, 1);
  assert.deepEqual(await readTracking({ workspace }), original);
  assert.equal(
    reconcileNativeRuns(original, { agents: [], tasks: [] }, 'root').runs[0].nativeAgentId,
    undefined,
  );
  original.runs[0].provider = 'common';
  assert.equal(reconcileNativeRuns(original, native, 'root').runs[0].nativeAgentId, undefined);
});

test('ambiguous paths, leaf names, other sessions and non-Codex providers never guess identity', () => {
  for (const scenario of [
    'duplicate-agent',
    'duplicate-run',
    'leaf',
    'other-root',
    'other-provider',
    'reported-name',
  ]) {
    const raw = fixture(),
      native = snapshot();
    if (scenario === 'duplicate-agent')
      native.agents.push({ ...native.agents[1], nativeAgentId: 'second' });
    if (scenario === 'duplicate-run') raw.runs.push({ ...raw.runs[0], runId: 'second' });
    if (scenario === 'leaf') raw.runs[0].agentName = 'ux_inventory';
    if (scenario === 'other-root') native.agents[1].parentSessionId = 'elsewhere';
    if (scenario === 'other-provider') raw.runs[0].provider = 'common';
    if (scenario === 'reported-name')
      native.agents[1].agentNameSource = 'native-coordinator/task-name';
    assert.equal(
      reconcileNativeRuns(raw, native, 'root').runs[0].nativeAgentId,
      undefined,
      scenario,
    );
  }
});

test('newer run beats stale native completion; native failure and review stage stay distinct', () => {
  const raw = fixture(),
    native = snapshot();
  raw.runs[0].updatedAt = time('40');
  assert.equal(reconcileNativeRuns(raw, native, 'root').runs[0].status, 'running');
  raw.runs[0].statusUpdatedAt = time('30');
  native.tasks[0].executionStatus = 'failed';
  let projected = projectTracking(reconcileNativeRuns(raw, native, 'root'), 'root');
  assert.equal(taskColumn(projected.tasks[0]), 'unknown');
  raw.tasks[0].status = 'awaiting_review';
  projected = projectTracking(reconcileNativeRuns(raw, native, 'root'), 'root');
  assert.equal(taskColumn(projected.tasks[0]), 'review');
  assert.equal(raw.runs[0].status, 'running');
});

test('resumed instance binds historical and current task without duplication or leaking new activity into closed work', () => {
  const raw = fixture(),
    native = snapshot();
  raw.runs[0].status = 'completed';
  raw.runs[0].activitySummary = 'Original UX result';
  raw.tasks.push({
    teamId: 'app',
    taskId: 'review',
    title: 'Review',
    status: 'running',
    dependencies: ['ux'],
  });
  raw.runs.push({
    ...raw.runs[0],
    runId: 'review-1',
    taskId: 'review',
    status: 'running',
    role: 'Spec Reviewer',
    updatedAt: time('35'),
  });
  const linked = reconcileNativeRuns(raw, native, 'root');
  assert.ok(linked.runs.every((r) => r.nativeAgentId === 'actual'));
  assert.equal(linked.runs[0].status, 'completed');
  assert.equal(linked.runs[0].activitySummary, 'Original UX result');
  assert.equal(linked.runs[1].status, 'completed');
  const projected = projectTracking(linked, 'root');
  const nodes = orgRoleView(projected.agents, projected.tasks);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].recentTask.taskId, 'review');
});
