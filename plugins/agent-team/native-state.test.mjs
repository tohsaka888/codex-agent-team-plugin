import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingest, readSnapshot } from './native-state.mjs';
import { checklist } from './traceability.mjs';

test('完成不推断逐项验收或人工通过，后续同步保留有依据的检查与评审记录', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project' };
  const base = {
    kind: 'task-report',
    cwd: workspace.path,
    sessionId: 'root',
    taskId: 'trace',
    title: '交付追踪',
  };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
    });
    await ingest(dir, {
      ...base,
      executionStatus: 'completed',
      reviewPhase: 'passed',
      acceptance: '甲；乙',
    });
    let task = (await readSnapshot(dir, workspace)).tasks[0];
    assert.deepEqual(task.acceptanceItems, []);
    assert.deepEqual(task.reviewRecords, []);
    await ingest(dir, {
      ...base,
      reviewRecords: [{ id: 'early', actorType: 'agent', author: 'Reviewer', summary: '初步检查' }],
    });
    assert.equal((await readSnapshot(dir, workspace)).tasks[0].acceptance, '甲；乙');
    await ingest(dir, {
      ...base,
      acceptanceItems: [
        { id: 'a', label: '导航检查', status: 'passed' },
        {
          id: 'b',
          label: '独立滚动',
          status: 'passed',
          evidence: '浏览器实测',
          reportedBy: 'Coordinator',
        },
      ],
      reviewRecords: [
        {
          id: 'agent-review',
          actorType: 'agent',
          author: 'Reviewer',
          nativeAgentId: 'reviewer',
          scope: 'delivery',
          decision: 'passed',
          summary: '滚动复查通过',
          evidence: '交付文件检查',
        },
        {
          id: 'human-unproven',
          actorType: 'human',
          author: '用户',
          decision: 'passed',
          summary: '未经确认',
          evidence: 'Agent猜测',
        },
      ],
    });
    await ingest(dir, {
      ...base,
      executionStatus: 'completed',
      reviewRecords: [
        {
          id: 'design-confirm',
          actorType: 'human',
          author: '用户',
          scope: 'design',
          decision: 'confirmed',
          source: 'user-confirmation',
          summary: '确认设计范围',
          evidence: '用户明确回复：确认，按此实施',
        },
      ],
    });
    task = (await readSnapshot(dir, workspace)).tasks[0];
    assert.deepEqual(
      task.acceptanceItems.map((i) => i.status),
      ['unknown', 'passed'],
    );
    assert.deepEqual(
      task.reviewRecords.map((r) => [r.id, r.decision]),
      [
        ['early', 'comment'],
        ['agent-review', 'passed'],
        ['human-unproven', 'comment'],
        ['design-confirm', 'confirmed'],
      ],
    );
    await ingest(dir, { ...base, acceptanceItems: [] });
    assert.deepEqual(checklist((await readSnapshot(dir, workspace)).tasks[0]), []);
    await ingest(dir, { ...base, acceptance: '新的条件' });
    assert.equal(checklist((await readSnapshot(dir, workspace)).tasks[0])[0].label, '新的条件');
    await ingest(dir, {
      ...base,
      sessionId: 'other',
      reviewRecords: [
        { id: 'agent-review', actorType: 'agent', author: 'Different', summary: '另一会话' },
      ],
    });
    assert.equal(
      (await readSnapshot(dir, workspace, { rootSessionId: 'root' })).tasks[0].reviewRecords.find(
        (r) => r.id === 'agent-review',
      ).author,
      'Reviewer',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('未回报职责的通用原生类型保持职责未知', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project' };
  try {
    await ingest(dir, {
      cwd: workspace.path,
      session_id: 'root',
      agent_id: 'child',
      agent_type: 'worker',
      hook_event_name: 'SubagentStart',
    });
    const snapshot = await readSnapshot(dir, workspace);
    assert.equal(snapshot.agents[0].role, null);
    assert.equal(snapshot.agents[0].nativeRole, 'worker');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('职责与原生类型分别保留，明确派生名称不从任务标题猜测', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project' };
  try {
    await ingest(dir, {
      cwd: workspace.path,
      session_id: 'root',
      agent_id: 'child',
      agent_type: 'worker',
      hook_event_name: 'SubagentStart',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      nativeAgentId: 'child',
      taskId: 't',
      title: '实现Org',
      role: 'Developer',
      agentName: 'org_ui_developer',
    });
    const snapshot = await readSnapshot(dir, workspace);
    assert.equal(snapshot.agents[0].nativeRole, 'worker');
    assert.equal(snapshot.agents[0].role, 'Developer');
    assert.equal(snapshot.agents[0].agentName, 'org_ui_developer');
    assert.equal(snapshot.agents[0].agentNameSource, 'native-coordinator/task-name');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('主会话看板包含真实全部后代及其任务，隔离同Workspace其他会话', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    for (const root of ['rootA', 'rootB'])
      await ingest(dir, {
        kind: 'host-observation',
        cwd: workspace.path,
        sessionId: root,
        source: 'codex-app/list_threads',
      });
    for (const [parent, child] of [
      ['rootA', 'childA'],
      ['childA', 'grandchildA'],
      ['rootB', 'childB'],
    ]) {
      await ingest(dir, {
        cwd: workspace.path,
        hook_event_name: 'SubagentStart',
        session_id: parent,
        agent_id: child,
      });
      await ingest(dir, {
        kind: 'task-report',
        cwd: workspace.path,
        sessionId: parent,
        nativeAgentId: child,
        taskId: 'one',
        title: child,
      });
    }
    const snapshot = await readSnapshot(dir, workspace, { rootSessionId: 'rootA' });
    assert.deepEqual(snapshot.agents.map((a) => a.nativeAgentId).sort(), [
      'childA',
      'grandchildA',
      'rootA',
    ]);
    assert.deepEqual(snapshot.tasks.map((t) => t.title).sort(), ['childA', 'grandchildA']);
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'rootA',
      nativeAgentId: 'grandchildA',
      taskId: 'grand-root-report',
      title: '根协调者回报孙任务',
    });
    const grand = await readSnapshot(dir, workspace, { rootSessionId: 'rootA' });
    assert.ok(grand.tasks.some((t) => t.taskId === 'grand-root-report'));
    assert.equal(
      (await readSnapshot(dir, workspace, { rootSessionId: 'missing' })).coverage,
      'unobserved',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('子 Agent 自身会话停止保留父关系、角色及已关联任务', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
    });
    await ingest(dir, {
      cwd: workspace.path,
      hook_event_name: 'SubagentStart',
      session_id: 'root',
      agent_id: 'child',
      agent_type: 'developer',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      nativeAgentId: 'child',
      taskId: 'one',
      title: '真实子任务',
    });
    await ingest(dir, { cwd: workspace.path, hook_event_name: 'Stop', session_id: 'child' });
    const snapshot = await readSnapshot(dir, workspace);
    const child = snapshot.agents.find((a) => a.nativeAgentId === 'child');
    assert.equal(child.parentAgentId, 'root');
    assert.equal(child.role, null);
    assert.equal(child.nativeRole, 'developer');
    assert.equal(snapshot.tasks.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('同一子 Agent 后续启动不会被旧停止状态锁定', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    for (const [hook, at] of [
      ['SubagentStart', '06:00:00'],
      ['SubagentStop', '06:00:01'],
      ['SubagentStart', '06:00:02'],
    ])
      await ingest(dir, {
        cwd: workspace.path,
        hook_event_name: hook,
        session_id: 'root',
        agent_id: 'child',
        observedAt: '2026-10-02T' + at + 'Z',
      });
    assert.equal((await readSnapshot(dir, workspace)).agents[0].lifecycle, 'active');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('任务详情保留明确技能使用和产物证据，安装信息不冒充使用', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      taskId: 'one',
      title: '实际工程任务',
      skills: [
        { name: 'codebase-design', usage: 'reported-use', evidence: '以模块接口分析采集边界' },
        { name: 'installed-only', usage: 'installed', evidence: '目录存在' },
      ],
      artifacts: [
        {
          title: '架构分析',
          kind: 'report',
          reference: '.scratch/result.md',
          summary: '已收集团队结果',
          availability: 'available',
        },
      ],
    });
    const task = (await readSnapshot(dir, workspace)).tasks[0];
    assert.deepEqual(task.skills, [
      { name: 'codebase-design', usage: 'reported-use', evidence: '以模块接口分析采集边界' },
    ]);
    assert.equal(task.artifacts[0].reference, '.scratch/result.md');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('原生身份回报进入只读快照，未接入不伪装成空任务', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'local-project', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    assert.equal((await readSnapshot(dir, workspace)).coverage, 'unobserved');
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      hostId: 'local',
      sessionId: 'native-root-1',
      lifecycle: 'active',
      observedAt: '2026-10-02T06:00:00Z',
      source: 'codex-app/list_threads',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      hostId: 'local',
      sessionId: 'native-root-1',
      taskId: 'TASK-1',
      title: '查看真实任务',
      goal: '接入原生数据',
      executionStatus: 'running',
      role: 'Coordinator',
      observedAt: '2026-10-02T06:00:01Z',
    });
    const snapshot = await readSnapshot(dir, workspace);
    assert.equal(snapshot.tasks.length, 1);
    assert.equal(snapshot.tasks[0].nativeAgentId, 'native-root-1');
    assert.equal(snapshot.tasks[0].title, '查看真实任务');
    assert.equal(snapshot.tasks[0].identitySource, 'codex-app/list_threads');
    assert.equal(
      (await readSnapshot(dir, { ...workspace, path: 'D:\\other' })).coverage,
      'unobserved',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('缺少原生身份的任务回报不能成为真实看板 Task', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'local-project', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'missing-native-id',
      taskId: 'unmatched',
      title: '未关联任务',
      executionStatus: 'completed',
    });
    const snapshot = await readSnapshot(dir, workspace);
    assert.equal(snapshot.tasks.length, 0);
    assert.equal(snapshot.unassociated.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('原生主会话 Stop 与 Interrupt 更新生命周期，不覆盖 Task 阶段', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'local-project', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
      lifecycle: 'active',
      observedAt: '2026-10-02T06:00:00Z',
    });
    await ingest(dir, {
      cwd: workspace.path,
      session_id: 'root',
      hook_event_name: 'Stop',
      observedAt: '2026-10-02T06:00:01Z',
    });
    assert.equal((await readSnapshot(dir, workspace)).agents[0].lifecycle, 'idle');
    await ingest(dir, {
      cwd: workspace.path,
      session_id: 'root',
      hook_event_name: 'Interrupt',
      observedAt: '2026-10-02T06:00:02Z',
    });
    assert.equal((await readSnapshot(dir, workspace)).agents[0].lifecycle, 'interrupted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('时区偏移与 UTC 回报按照真实时刻排序', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
      observedAt: '2026-10-02T05:00:00Z',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      taskId: 'one',
      title: '较晚回报',
      observedAt: '2026-10-02T06:30:00Z',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      taskId: 'one',
      title: '较早回报',
      observedAt: '2026-10-02T07:00:00+01:00',
    });
    assert.equal((await readSnapshot(dir, workspace)).tasks[0].title, '较晚回报');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('原生 SubagentStop 不推断 Task 成功，不采集提示或密钥', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'local-project', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      cwd: workspace.path,
      hook_event_name: 'SubagentStop',
      session_id: 'root',
      agent_id: 'child',
      agent_type: 'reviewer',
      observedAt: '2026-10-02T06:00:01Z',
      last_assistant_message: 'SECRET',
    });
    await ingest(dir, {
      cwd: workspace.path,
      hook_event_name: 'SubagentStart',
      session_id: 'root',
      agent_id: 'child',
      observedAt: '2026-10-02T06:00:00Z',
      transcript_path: 'SECRET',
    });
    await ingest(dir, {
      kind: 'task-report',
      cwd: workspace.path,
      sessionId: 'root',
      nativeAgentId: 'child',
      taskId: 'child-task',
      title: '真实子任务',
      executionStatus: 'running',
    });
    const snapshot = await readSnapshot(dir, workspace);
    assert.equal(snapshot.agents[0].lifecycle, 'stopped');
    assert.equal(snapshot.tasks[0].executionStatus, 'running');
    assert.equal(snapshot.tasks[0].reviewPhase, 'unknown');
    assert.equal(snapshot.agents[0].parentAgentId, null);
    assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('父会话只有匹配已观察原生身份时才生成父 Agent 关系', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-team-'));
  const workspace = { id: 'p', hostId: 'local', path: 'D:\\project', kind: 'local' };
  try {
    await ingest(dir, {
      kind: 'host-observation',
      cwd: workspace.path,
      sessionId: 'root',
      source: 'codex-app/list_threads',
    });
    await ingest(dir, {
      cwd: workspace.path,
      hook_event_name: 'SubagentStart',
      session_id: 'root',
      agent_id: 'child',
    });
    const child = (await readSnapshot(dir, workspace)).agents.find(
      (a) => a.nativeAgentId === 'child',
    );
    assert.equal(child.parentAgentId, 'root');
    assert.equal(child.parentSource, 'native-parent-session/matched-observed-agent');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
