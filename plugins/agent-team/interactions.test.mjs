import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendOperation, readTracking } from './skills/team-sync/scripts/tracking-core.mjs';
import { startWebServer } from './web-server.mjs';
import { readInteractions } from './interactions.mjs';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const ac = [{ id: 'check', label: '实际关联', method: 'query', kind: 'check', verifier: 'agent' }];
async function fixture() {
  const workspace = await mkdtemp(resolve(tmpdir(), 'agent-interactions-'));
  const config = { workspace };
  const teamId = 'team-a';
  await appendOperation(config, { kind: 'team', teamId, title: '真实同步事件' });
  await appendOperation(config, {
    kind: 'task',
    teamId,
    taskId: '01',
    title: '消息链',
    role: 'Developer',
    taskType: 'analysis',
    version: 'v1',
    acceptanceItems: ac,
  });
  for (const runId of ['sender', 'receiver'])
    await appendOperation(config, {
      kind: 'run',
      teamId,
      taskId: '01',
      runId,
      status: 'queued',
      provider: 'common',
      agentName: '/root/' + runId,
      role: 'Developer',
      taskType: 'analysis',
      version: 'v1',
      acceptanceItems: ac,
    });
  return config;
}
test('公开CLI→HTTP覆盖正文、回复链、增量去重、乱序及独立业务状态', async () => {
  const config = await fixture();
  assert.deepEqual((await readTracking(config)).interactions, []);
  const bodyPath = resolve(config.workspace, 'body.json');
  const cli = async (body) => {
    await writeFile(bodyPath, JSON.stringify(body));
    const result = await exec(process.execPath, [
      resolve(here, 'skills/team-sync/scripts/sync.mjs'),
      'interaction',
      '--workspace',
      config.workspace,
      '--body-file',
      bodyPath,
    ]);
    return JSON.parse(result.stdout);
  };
  const base = {
    teamId: 'team-a',
    taskId: '01',
    fromRunId: 'sender',
    toRunId: 'receiver',
    source: 'host/native-message',
    producer: 'test-fact',
    timestamp: '2026-10-09T00:00:00Z',
  };
  const reply = {
    ...base,
    messageId: 'reply-1',
    eventId: 'reply-event',
    type: 'reply',
    replyTo: 'original',
    content: '实际回复：已收到',
  };
  await cli(reply);
  const unknown = await readInteractions({ ...config, teamId: 'team-a' });
  assert.equal(unknown.interactions[0].replyToAvailability, 'unknown');
  const content = '实际正文\n中文符号 <script> & ' + '长正文'.repeat(6000);
  const original = {
    ...base,
    timestamp: '2026-10-08T23:59:00Z',
    messageId: 'original',
    eventId: 'message-event',
    type: 'message',
    content,
  };
  await cli(original);
  assert.equal((await cli(original)).duplicate, true);
  assert.equal((await cli({ ...original, eventId: 'retry-different-id' })).duplicate, true);
  await assert.rejects(
    cli({ ...original, eventId: 'collision', content: '不同正文' }),
    /messageId already exists/,
  );
  await cli({ ...base, messageId: 'dispatch', type: 'dispatch', content: '实际分派的内容' });
  await cli({
    ...base,
    messageId: 'status',
    type: 'status',
    status: 'completed',
    content: '宿主状态已观察到完成',
  });
  const raw = await readTracking(config);
  assert.equal(raw.tasks[0].status, 'queued');
  assert.equal(raw.runs[0].status, 'queued');
  assert.equal(raw.tasks[0].acceptance.accepted, false);
  const server = await startWebServer({ ...config, port: 0 });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/interactions?teamId=team-a';
    const first = await (await fetch(url + '&limit=1')).json();
    assert.equal(first.interactions[0].messageId, 'reply-1');
    assert.equal(first.interactions[0].replyToAvailability, 'known');
    assert.equal(first.interactions[0].from.agentName, '/root/sender');
    assert.equal(first.hasMore, true);
    const second = await (await fetch(url + '&after=' + first.nextCursor)).json();
    assert.deepEqual(
      second.interactions.map((item) => item.messageId),
      ['original', 'dispatch', 'status'],
    );
    assert.equal(second.interactions[0].content, content);
    assert.equal(second.interactions[0].timestamp, original.timestamp);
    assert.ok(second.interactions[0].recordedAt);
    assert.equal(
      (await (await fetch(url + '&after=' + second.nextCursor)).json()).interactions.length,
      0,
    );
    assert.equal(
      (await (await fetch(url + '&runId=receiver&type=message')).json()).interactions.length,
      1,
    );
    assert.equal((await fetch(url + '&after=-1')).status, 503);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
test('跨团队与共享数据目录的工作区隔离；未知身份不按名称补造', async () => {
  const config = await fixture();
  const archive = resolve(config.workspace, 'shared');
  const one = { ...config, dataDir: archive };
  const otherWorkspace = resolve(config.workspace, 'other');
  await mkdir(otherWorkspace);
  const two = { workspace: otherWorkspace, dataDir: archive };
  for (const target of [one, two]) await appendOperation(target, { kind: 'team', teamId: 'same' });
  await appendOperation(one, { kind: 'team', teamId: 'other-team' });
  const message = {
    kind: 'interaction',
    teamId: 'same',
    messageId: 'same-id',
    type: 'message',
    content: 'workspace-one',
    fromRunId: 'unknown-run',
    source: 'explicit',
  };
  await appendOperation(one, message);
  await appendOperation(two, { ...message, content: 'workspace-two' });
  await appendOperation(one, { ...message, teamId: 'other-team', content: 'other-team' });
  const first = await readInteractions({ ...one, teamId: 'same' });
  assert.equal(first.interactions.length, 1);
  assert.equal(first.interactions[0].content, 'workspace-one');
  assert.deepEqual(first.interactions[0].from, {
    runId: 'unknown-run',
    agentName: null,
    nativeAgentId: null,
    role: null,
    availability: 'unknown',
  });
  assert.equal(first.interactions[0].to.availability, 'unknown');
  assert.equal(first.interactions[0].taskAvailability, 'unknown');
  assert.equal(
    (await readInteractions({ ...two, teamId: 'same' })).interactions[0].content,
    'workspace-two',
  );
  await assert.rejects(readInteractions({ ...one, teamId: 'absent' }), /团队不可用/);
  await assert.rejects(
    appendOperation(one, { ...message, messageId: 'bad', type: 'reply' }),
    /replyTo/,
  );
});

test('已知跨team回复与自引用/循环拒绝，真正未知的晚到原消息保留可补齐', async () => {
  const config = await fixture();
  await appendOperation(config, { kind: 'team', teamId: 'team-b' });
  const message = {
    kind: 'interaction',
    teamId: 'team-b',
    messageId: 'foreign',
    type: 'message',
    content: '原消息',
    source: 'explicit',
  };
  await appendOperation(config, message);
  const reply = {
    ...message,
    teamId: 'team-a',
    messageId: 'reply',
    type: 'reply',
    replyTo: 'foreign',
  };
  await assert.rejects(appendOperation(config, reply), /another team/);
  await assert.rejects(appendOperation(config, { ...reply, replyTo: 'reply' }), /self reference/);
  await appendOperation(config, { ...reply, replyTo: 'late' });
  await assert.rejects(
    appendOperation(config, { ...reply, messageId: 'late', replyTo: 'reply' }),
    /cycle/,
  );
  await appendOperation(config, { ...message, messageId: 'late' });
  assert.equal(
    (await readInteractions({ ...config, teamId: 'team-a' })).interactions[0].replyToAvailability,
    'unknown',
  );
  await appendOperation(config, { ...message, teamId: 'team-a', messageId: 'late' });
  assert.equal(
    (await readInteractions({ ...config, teamId: 'team-a' })).interactions[0].replyToAvailability,
    'known',
  );
});
