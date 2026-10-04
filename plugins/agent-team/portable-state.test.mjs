import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTracking } from './portable-state.mjs';
import { orgRoleView } from './web/org-view.mjs';
import { orgForest } from './web/org-view.mjs';
import { sessionUrl } from './web/navigation.mjs';
import { taskColumn } from './web/view-model.mjs';

test('planned task is visible without a fabricated agent; all runs remain linked', () => {
  const raw = {
    teams: [{ teamId: 'app', title: 'App', provider: 'common' }],
    tasks: [{ teamId: 'app', taskId: '01', title: 'Build', status: 'queued' }],
    runs: [],
  };
  const planned = projectTracking(raw, 'team:app');
  assert.equal(planned.tasks.length, 1);
  assert.equal(planned.tasks[0].executionStatus, 'queued');
  assert.equal(planned.tasks[0].nativeAgentId, null);
  assert.equal(planned.agents.length, 0);
  raw.tasks[0].status = 'awaiting_review';
  raw.runs = ['dev', 'review', 'repair'].map((runId) => ({
    teamId: 'app',
    taskId: '01',
    runId,
    status: 'completed',
    provider: 'common',
    agentName: runId,
    observedAt: '2026-10-03T00:00:00Z',
  }));
  const reviewed = projectTracking(raw, 'team:app');
  assert.equal(reviewed.tasks[0].runs.length, 3);
  assert.equal(reviewed.tasks[0].reviewPhase, 'awaiting_review');
  assert.equal(reviewed.agents.length, 3);
  assert.ok(reviewed.agents.every((a) => a.nativeAgentId === null && a.agentId));
  assert.ok(reviewed.agents.every((a) => a.lifecycle === 'unknown'));
});

test('multiple teams bound to a native root retain scoped runs and no duplicate session', () => {
  const raw = {
    teams: ['one', 'two'].map((teamId) => ({ teamId, rootSessionId: 'root', title: teamId })),
    tasks: ['one', 'two'].map((teamId) => ({
      teamId,
      taskId: '01',
      title: teamId,
      status: 'queued',
    })),
    runs: ['one', 'two'].map((teamId) => ({
      teamId,
      taskId: '01',
      runId: 'dev',
      provider: 'common',
      status: 'running',
    })),
  };
  const snapshot = projectTracking(raw, 'root');
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.tasks.length, 2);
  assert.ok(snapshot.tasks.every((t) => t.runs.length === 1 && t.runs[0].teamId === t.teamId));
});

test('same instance resumed from its prior run is not a self-parent; unavailable skills and reviewer identity remain accurate', () => {
  const raw = {
    teams: [{ teamId: 'one', title: 'App' }],
    tasks: [
      {
        teamId: 'one',
        taskId: '01',
        title: 'Build',
        reviewRecords: [
          {
            id: 'review',
            runId: 'second',
            authorType: 'agent',
            author: 'Reviewer',
            decision: 'approved',
            evidence: 'checked',
          },
        ],
      },
    ],
    runs: [
      {
        teamId: 'one',
        taskId: '01',
        runId: 'first',
        provider: 'codex',
        nativeAgentId: 'actual',
        status: 'completed',
      },
      {
        teamId: 'one',
        taskId: '01',
        runId: 'second',
        parentRunId: 'first',
        provider: 'codex',
        nativeAgentId: 'actual',
        status: 'running',
        skills: [{ name: 'imagegen', status: 'unavailable', evidence: 'tool missing' }],
      },
    ],
  };
  const snapshot = projectTracking(raw, 'team:one');
  assert.equal(orgForest(snapshot.agents).unlinked.length, 0);
  assert.equal(snapshot.agents[0].parentAgentId, null);
  assert.equal(snapshot.tasks[0].skills[0].usage, 'unavailable');
  assert.equal(snapshot.tasks[0].reviewRecords[0].nativeAgentId, 'actual');
});

test('portable reviews retain partial confirmation and do not approve a new version', () => {
  const digest = 'a'.repeat(64);
  const task = {
    teamId: 'app',
    taskId: '01',
    title: 'UI',
    status: 'awaiting_review',
    reviewRequirements: ['home', 'lesson'].map((id) => ({
      id,
      type: 'visual',
      label: id,
      version: 'v1',
      digest,
      reference: id + '.png',
      producer: 'coordinator',
    })),
    reviewRecords: [
      {
        id: 'human-1',
        requirementId: 'home',
        version: 'v1',
        digest,
        authorType: 'human',
        author: 'user',
        decision: 'approved',
        quote: '确认首页',
        evidence: 'actual user response',
        updatedAt: '2026-10-03T01:00:00Z',
      },
    ],
  };
  const raw = { teams: [{ teamId: 'app', title: 'App' }], tasks: [task], runs: [] };
  let projected = projectTracking(raw, 'team:app').tasks[0];
  assert.deepEqual(
    projected.humanReview.items.map((i) => i.status),
    ['confirmed', 'awaiting_confirmation'],
  );
  task.reviewRequirements[0].version = 'v2';
  task.reviewRequirements[0].digest = 'b'.repeat(64);
  projected = projectTracking(raw, 'team:app').tasks[0];
  assert.equal(projected.humanReview.items[0].status, 'stale_confirmation');
  assert.equal(taskColumn(projected), 'review');
});

test('org links all roles of one task and non-Codex UUIDs never create Codex navigation', () => {
  const raw = {
    teams: [{ teamId: 'app', title: 'App' }],
    tasks: [{ teamId: 'app', taskId: '01', title: 'Build', status: 'repair_required' }],
    runs: [
      {
        teamId: 'app',
        taskId: '01',
        runId: 'dev',
        role: 'Developer',
        provider: 'common',
        status: 'completed',
        updatedAt: '2026-10-03T01:00:00Z',
      },
      {
        teamId: 'app',
        taskId: '01',
        runId: 'review',
        role: 'Reviewer',
        provider: 'common',
        status: 'completed',
        updatedAt: '2026-10-03T02:00:00Z',
      },
    ],
  };
  const snapshot = projectTracking(raw, 'team:app');
  const nodes = orgRoleView(snapshot.agents, snapshot.tasks);
  assert.equal(nodes.length, 2);
  assert.ok(nodes.every((n) => n.recentTask?.taskId === '01'));
  assert.equal(
    nodes.find((n) => n.role === 'Developer').recentTask.observedAt,
    '2026-10-03T01:00:00Z',
  );
  assert.equal(sessionUrl('12345678-1234-1234-1234-123456789abc', 'local', 'common'), null);
});

test('same actual instance retains multiple runs; team scope does not guess titles', () => {
  const raw = {
    teams: [
      { teamId: 'one', title: 'Same', rootSessionId: 'native-root', provider: 'codex' },
      { teamId: 'two', title: 'Same' },
    ],
    tasks: [{ teamId: 'one', taskId: '01', title: 'Build', status: 'blocked' }],
    runs: ['first', 'second'].map((runId) => ({
      teamId: 'one',
      taskId: '01',
      runId,
      provider: 'codex',
      nativeAgentId: 'actual',
      status: 'completed',
      observedAt: '2026-10-03T00:00:00Z',
    })),
  };
  const state = projectTracking(raw, 'native-root');
  assert.equal(state.agents.length, 1);
  assert.equal(state.agents[0].runIds.length, 2);
  assert.equal(state.tasks[0].businessStatus, 'blocked');
  assert.equal(projectTracking(raw, 'team:two').tasks.length, 0);
});

test('resumed task hides obsolete blocked reason and retains latest activity timestamp', () => {
  const snapshot = projectTracking(
    {
      teams: [{ teamId: 'app', title: 'App' }],
      tasks: [
        {
          teamId: 'app',
          taskId: '01',
          title: 'Build',
          status: 'running',
          blockedReason: 'old blocker',
        },
      ],
      runs: [
        {
          teamId: 'app',
          taskId: '01',
          runId: 'dev',
          status: 'running',
          provider: 'common',
          activitySummary: 'fresh activity',
          activitySummaryAt: '2026-10-03T03:00:00Z',
          activities: [{ summary: 'late old', timestamp: '2026-10-03T02:00:00Z' }],
        },
      ],
    },
    'team:app',
  );
  assert.equal(snapshot.tasks[0].activitySummary, 'fresh activity');
  assert.equal(snapshot.tasks[0].activityAt, '2026-10-03T03:00:00Z');
});

test('explicit running task or active review run stays visible despite unsynced business dependencies', () => {
  const raw = {
    teams: [{ teamId: 'app' }],
    tasks: [
      { teamId: 'app', taskId: 'dev', title: 'Develop', status: 'running' },
      {
        teamId: 'app',
        taskId: 'review',
        title: 'Review',
        status: 'running',
        dependencies: ['dev'],
      },
    ],
    runs: [
      {
        teamId: 'app',
        taskId: 'review',
        runId: 'spec',
        provider: 'common',
        status: 'running',
        updatedAt: '2026-10-04T01:30:00Z',
      },
      {
        teamId: 'app',
        taskId: 'review',
        runId: 'standards',
        provider: 'common',
        status: 'completed',
        updatedAt: '2026-10-04T01:31:00Z',
      },
    ],
  };
  let projected = projectTracking(raw, 'team:app');
  const review = projected.tasks[1];
  assert.equal(taskColumn(review), 'running');
  assert.equal(review.executionStatus, 'running');
  assert.equal(review.currentRunId, 'spec');
  assert.match(review.dependencyWarning, /dev/);
  assert.equal(projected.tasks[0].executionUnreported, true);
  raw.tasks[1].status = 'queued';
  assert.equal(taskColumn(projectTracking(raw, 'team:app').tasks[1]), 'running');
  raw.runs = [];
  assert.equal(taskColumn(projectTracking(raw, 'team:app').tasks[1]), 'unknown');
  raw.tasks[1].status = 'blocked';
  raw.runs = [{ teamId: 'app', taskId: 'review', runId: 'spec', status: 'running' }];
  assert.equal(taskColumn(projectTracking(raw, 'team:app').tasks[1]), 'unknown');
});

test('human free-text coverage is retained while matching confirmed requirement scope and fingerprint', () => {
  const digest = 'a'.repeat(64);
  const snapshot = projectTracking(
    {
      teams: [{ teamId: 'app' }],
      tasks: [
        {
          teamId: 'app',
          taskId: 'ui',
          title: 'UI',
          reviewRequirements: [
            {
              id: 'main',
              type: 'visual',
              label: 'Main',
              version: 'v1',
              digest,
              reference: 'main.png',
              producer: 'coordinator',
            },
          ],
          reviewRecords: [
            {
              id: 'approved',
              requirementId: 'main',
              authorType: 'human',
              author: 'user',
              decision: 'approved',
              quote: '确认v1',
              scope: '今日、学习、成长',
              evidence: '保存的用户原话',
              version: 'v1',
              digest,
            },
          ],
        },
      ],
      runs: [],
    },
    'team:app',
  );
  assert.equal(snapshot.tasks[0].humanReview.items[0].status, 'confirmed');
  assert.equal(snapshot.tasks[0].reviewRecords[0].scope, 'design');
  assert.match(snapshot.tasks[0].reviewRecords[0].summary, /今日、学习、成长/);
});

test('parallel review failure is not hidden by another completed reviewer; repair on the same instance replaces its earlier failure', () => {
  const raw = {
    teams: [{ teamId: 'app' }],
    tasks: [{ teamId: 'app', taskId: 'review', status: 'running', title: 'Review' }],
    runs: [
      {
        teamId: 'app',
        taskId: 'review',
        runId: 'spec',
        provider: 'codex',
        nativeAgentId: 'spec-agent',
        status: 'failed',
        updatedAt: '2026-10-04T01:30:00Z',
      },
      {
        teamId: 'app',
        taskId: 'review',
        runId: 'standards',
        provider: 'codex',
        nativeAgentId: 'standards-agent',
        status: 'completed',
        updatedAt: '2026-10-04T01:31:00Z',
      },
    ],
  };
  assert.equal(taskColumn(projectTracking(raw, 'team:app').tasks[0]), 'unknown');
  raw.runs.push({
    ...raw.runs[0],
    runId: 'repair',
    status: 'completed',
    updatedAt: '2026-10-04T01:32:00Z',
  });
  assert.equal(taskColumn(projectTracking(raw, 'team:app').tasks[0]), 'completed');
});
