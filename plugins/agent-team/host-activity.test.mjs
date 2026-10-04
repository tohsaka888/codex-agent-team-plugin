import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hydrateActivity, readActivity } from './host-activity.mjs';
import { readSnapshot, ingest } from './native-state.mjs';
import { orgRoleView } from './web/org-view.mjs';

const record = (type, payload, sec = 0) =>
  JSON.stringify({ type, payload, timestamp: new Date(1700000000000 + sec * 1000).toISOString() });
test('成功原生分派及本实例回合恢复看板，忽略fork父回合与消息，业务回报优先', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'activity-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'sessions'));
  const root = {
    id: 'root',
    cwd: home,
    agentName: null,
    source: 'codex-host/sqlite',
    lastActivityAt: '2023-11-14T22:13:20Z',
    rolloutPath: join(home, 'sessions', 'root.jsonl'),
  };
  const child = {
    ...root,
    id: 'child',
    parentSessionId: 'root',
    agentName: '/root/learning',
    rolloutPath: join(home, 'sessions', 'child.jsonl'),
  };
  await writeFile(
    root.rolloutPath,
    [
      record('session_meta', { id: 'root' }),
      record('event_msg', { type: 'task_started', turn_id: 'r', root_turn_id: 'r' }),
      record('response_item', {
        type: 'function_call',
        name: 'spawn_agent',
        namespace: 'collaboration',
        call_id: 'c',
        arguments: JSON.stringify({
          task_name: 'learning',
          message: '分析移动端学习流程',
          agent_type: 'requirements',
        }),
      }),
      record('response_item', {
        type: 'function_call_output',
        call_id: 'c',
        output: JSON.stringify({ task_name: '/root/learning' }),
      }),
      record('event_msg', { type: 'item_completed', thread_id: 'root', turn_id: 'r' }),
    ].join('\n'),
  );
  const body = [
    record('session_meta', { id: 'child' }),
    record('session_meta', { id: 'root' }),
    record('event_msg', { type: 'task_started', turn_id: 'r', root_turn_id: 'r' }),
    record('event_msg', { type: 'task_complete', turn_id: 'r', last_agent_message: 'SECRET' }),
    record('event_msg', { type: 'task_started', turn_id: 'a', root_turn_id: 'r' }, 1),
  ];
  await writeFile(child.rolloutPath, body.join('\n') + '\n{partial');
  let threads = await hydrateActivity(home, [root, child], { path: home, hostId: 'local' }, 'root');
  assert.equal(threads[1].execution.status, 'running');
  assert.equal(threads[1].dispatch.role, 'requirements');
  assert.ok(!JSON.stringify(threads).includes('SECRET'));
  assert.equal(threads[1].dispatch.goal, '分析移动端学习流程');
  let snapshot = await readSnapshot(
    join(home, 'events'),
    { id: 'workspace', path: home, hostId: 'local' },
    { rootSessionId: 'root', nativeThreads: threads },
  );
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].executionStatus, 'running');
  assert.equal(snapshot.tasks[0].goal, '分析移动端学习流程');
  assert.equal(snapshot.tasks[0].goalSource, 'codex-host/spawn-agent/message');
  assert.equal(snapshot.tasks[0].role, null);
  assert.equal(snapshot.agents.find((a) => a.nativeAgentId === 'child').nativeRole, 'requirements');
  assert.equal(snapshot.tasks[0].reviewPhase, 'unknown');
  assert.equal(snapshot.agents.find((a) => a.nativeAgentId === 'child').parentAgentId, 'root');
  assert.equal(
    orgRoleView(snapshot.agents, snapshot.tasks).find((a) => a.nativeAgentId === 'child').role,
    'Requirements',
  );
  body.push(
    record(
      'event_msg',
      {
        type: 'item_completed',
        thread_id: 'child',
        turn_id: 'a',
        item: {
          type: 'CommandExecution',
          status: 'completed',
          stdout: 'SECRET',
          command: ['SECRET'],
        },
      },
      2,
    ),
    record(
      'event_msg',
      {
        type: 'item_completed',
        thread_id: 'child',
        turn_id: 'a',
        item: {
          type: 'AgentMessage',
          phase: 'commentary',
          content: [{ type: 'Text', text: '已检查移动端目录，正在整理建议。' }],
        },
      },
      3,
    ),
    record(
      'event_msg',
      {
        type: 'item_completed',
        thread_id: 'child',
        turn_id: 'a',
        item: { type: 'Reasoning', raw_content: ['SECRET'] },
      },
      4,
    ),
    record('event_msg', { type: 'task_complete', turn_id: 'a' }, 5),
  );
  await writeFile(child.rolloutPath, body.join('\n'));
  threads = await hydrateActivity(home, [root, child], { path: home, hostId: 'local' }, 'root');
  assert.equal(threads[1].execution.status, 'completed');
  assert.equal(threads[1].execution.activitySummary, '已检查移动端目录，正在整理建议。');
  assert.ok(!JSON.stringify(threads).includes('SECRET'));
  snapshot = await readSnapshot(
    join(home, 'events'),
    { id: 'workspace', path: home, hostId: 'local' },
    { rootSessionId: 'root', nativeThreads: threads },
  );
  assert.equal(snapshot.tasks[0].activitySummary, '已检查移动端目录，正在整理建议。');
  assert.equal(snapshot.tasks[0].activityAt, new Date(1700000003000).toISOString());
  await ingest(join(home, 'events'), {
    kind: 'task-report',
    cwd: home,
    sessionId: 'root',
    nativeAgentId: 'child',
    taskId: 'business',
    title: '真实业务任务',
    executionStatus: 'blocked',
  });
  snapshot = await readSnapshot(
    join(home, 'events'),
    { id: 'workspace', path: home, hostId: 'local' },
    { rootSessionId: 'root', nativeThreads: threads },
  );
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].title, '真实业务任务');
  assert.equal(snapshot.tasks[0].executionStatus, 'blocked');
  assert.equal(
    orgRoleView([{ nativeAgentId: 'child', role: null, agentName: '/root/learning' }])[0].role,
    'learning',
  );
  assert.equal(
    (
      await hydrateActivity(
        home,
        [root, child],
        { path: join(home, 'other'), hostId: 'local' },
        'root',
      )
    )[1].execution,
    undefined,
  );
});
test('无本实例证据不继承父回合，越界与缺失文件降级，失败不能归为完成', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'activity-limits-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'sessions'));
  const thread = {
    id: 'child',
    parentSessionId: 'root',
    rolloutPath: join(home, 'sessions', 'child.jsonl'),
  };
  const rows = [
    record('session_meta', { id: 'child' }),
    record('event_msg', { type: 'task_started', turn_id: 'r', root_turn_id: 'r' }),
    record('event_msg', { type: 'task_complete', turn_id: 'r' }),
  ];
  await writeFile(thread.rolloutPath, rows.join('\n'));
  assert.equal((await readActivity(home, thread)).latest, null);
  rows.push(
    record('event_msg', { type: 'task_started', turn_id: 'a', root_turn_id: 'r' }),
    record('event_msg', { type: 'task_complete', turn_id: 'a', error: 'SECRET' }),
  );
  await writeFile(thread.rolloutPath, rows.join('\n'));
  assert.equal((await readActivity(home, thread)).latest.status, 'failed');
  assert.equal(await readActivity(home, { ...thread, rolloutPath: join(home, 'missing') }), null);
  assert.equal(await readActivity(join(home, 'sessions'), thread), null);
});

test('原生 functions.spawn_agent 按 UUID 关联，动态类型和已分派待开始任务可展示', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dynamic-agent-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'sessions'));
  const root = { id: 'root', cwd: home, rolloutPath: join(home, 'sessions', 'root.jsonl') };
  const child = {
    id: 'child',
    cwd: home,
    parentSessionId: 'root',
    agentName: '/root/mobile_analysis',
  };
  await writeFile(
    root.rolloutPath,
    [
      record('session_meta', { id: 'root' }),
      record('event_msg', { type: 'task_started', turn_id: 'r' }),
      record('response_item', {
        type: 'function_call',
        name: 'functions.spawn_agent',
        call_id: 'spawn',
        arguments: JSON.stringify({ agent_type: 'explorer', message: '检查移动端布局' }),
      }),
      record('response_item', {
        type: 'function_call_output',
        call_id: 'spawn',
        output: JSON.stringify({ agent_id: 'child' }),
      }),
      record('event_msg', { type: 'item_completed', thread_id: 'root', turn_id: 'r' }),
    ].join('\n'),
  );
  const threads = await hydrateActivity(
    home,
    [root, child],
    { path: home, hostId: 'local' },
    'root',
  );
  const snapshot = await readSnapshot(
    join(home, 'events'),
    { id: 'p', path: home, hostId: 'local' },
    { rootSessionId: 'root', nativeThreads: threads },
  );
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].executionStatus, 'queued');
  assert.equal(snapshot.tasks[0].agentName, '/root/mobile_analysis');
  assert.equal(snapshot.tasks[0].goal, '检查移动端布局');
  assert.equal(snapshot.tasks[0].role, null);
});

test('加密分派目标不进入快照，长密文在截断前识别，可读目标不受影响', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'encrypted-goal-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, 'sessions'));
  const root = { id: 'root', cwd: home, rolloutPath: join(home, 'sessions', 'root.jsonl') };
  for (const message of ['gAAAAA' + 'x'.repeat(7000) + '==', '修复移动端登录流程']) {
    await writeFile(
      root.rolloutPath,
      [
        record('session_meta', { id: 'root' }),
        record('event_msg', { type: 'task_started', turn_id: 'r' }),
        record('response_item', {
          type: 'function_call',
          name: 'spawn_agent',
          call_id: 'c',
          arguments: JSON.stringify({ message }),
        }),
        record('response_item', {
          type: 'function_call_output',
          call_id: 'c',
          output: JSON.stringify({ agent_id: 'child' }),
        }),
        record('event_msg', { type: 'item_completed', thread_id: 'root', turn_id: 'r' }),
      ].join('\n'),
    );
    const threads = await hydrateActivity(
      home,
      [root, { id: 'child', cwd: home, parentSessionId: 'root' }],
      { path: home, hostId: 'local' },
      'root',
    );
    const snapshot = await readSnapshot(
      join(home, 'events'),
      { id: 'p', path: home, hostId: 'local' },
      { rootSessionId: 'root', nativeThreads: threads },
    );
    const encrypted = message.startsWith('gAAAAA');
    assert.equal(snapshot.tasks.length, 1);
    assert.equal(snapshot.tasks[0].goal, encrypted ? null : message);
    assert.equal(snapshot.tasks[0].goalUnavailableReason, encrypted ? 'encrypted' : null);
    assert.equal(snapshot.tasks[0].goalSource, encrypted ? null : 'codex-host/spawn-agent/message');
    if (encrypted) assert.ok(!JSON.stringify(snapshot).includes('gAAAAA'));
  }
});
