import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderChecklist, renderReviews } from './web/trace-detail.mjs';
import { sessionUrl, openNavigation } from './web/navigation.mjs';
import { readArtifact } from './artifact-reader.mjs';
import { ingest } from './native-state.mjs';
import { reviewRecords } from './traceability.mjs';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('人工验收反馈保留退回记录，反馈来源不能升级为通过或确认', () => {
  const value = {
    id: 'human',
    actorType: 'human',
    author: '用户',
    summary: '要求补齐执行追踪',
    evidence: '本会话明确反馈',
    source: 'user-feedback',
    scope: 'delivery',
  };
  assert.equal(
    reviewRecords([{ ...value, decision: 'changes_requested' }])[0].decision,
    'changes_requested',
  );
  assert.equal(reviewRecords([{ ...value, decision: 'passed' }])[0].decision, 'comment');
  assert.equal(reviewRecords([{ ...value, decision: 'confirmed' }])[0].decision, 'comment');
  assert.equal(
    reviewRecords([{ ...value, source: 'user-confirmation', decision: 'confirmed' }])[0].decision,
    'confirmed',
  );
});

test('旧验收文字只显示未知；逐项核对需要署名与依据；所有用户文字转义', () => {
  const legacy = renderChecklist({ acceptance: '第一项；第二项', executionStatus: 'completed' });
  assert.equal((legacy.match(/aria-checked="false"/g) || []).length, 2);
  assert.ok(!legacy.includes('aria-checked="true"'));
  const items = renderChecklist({
    acceptanceItems: [
      {
        id: 'a',
        label: '<script>alert(1)</script>',
        status: 'passed',
        evidence: '37项检查',
        reportedBy: 'Coordinator',
      },
    ],
  });
  assert.ok(items.includes('aria-checked="true"'));
  assert.ok(!items.includes('<script>'));
  const review = renderReviews({
    reviewPhase: 'passed',
    reviewRecords: [
      {
        id: 'r',
        actorType: 'agent',
        author: 'Reviewer',
        summary: '检查通过',
        decision: 'passed',
        evidence: '文件复查',
        scope: 'delivery',
      },
    ],
  });
  assert.ok(review.includes('Agent 评审'));
  assert.ok(review.includes('当前结果尚待人工验收'));
});

test('会话导航仅接受本机真实 UUID，宿主拒绝或预览模式均反馈失败', async () => {
  const uuid = '01a0fb2b-3ce2-7093-a188-548895a3812f';
  assert.equal(sessionUrl(uuid), 'codex://threads/' + uuid);
  assert.equal(sessionUrl('org:Architect'), null);
  assert.equal(sessionUrl(uuid, 'ssh-host'), null);
  assert.equal(sessionUrl('gggggggg-gggg-gggg-gggg-gggggggggggg'), null);
  const errors = [];
  let calls = 0;
  const app = {
    openLink: async () => {
      calls++;
      return { isError: true };
    },
  };
  assert.equal(
    await openNavigation({
      url: sessionUrl(uuid),
      app,
      embedded: false,
      onError: (m) => errors.push(m),
    }),
    false,
  );
  assert.equal(calls, 0);
  assert.equal(
    await openNavigation({
      url: sessionUrl(uuid),
      app,
      embedded: true,
      onError: (m) => errors.push(m),
    }),
    false,
  );
  assert.equal(calls, 1);
  assert.equal(errors.length, 2);
  assert.equal(
    await openNavigation({
      url: 'codex://threads/' + uuid + '?prompt=injected',
      app,
      embedded: true,
      onError: (m) => errors.push(m),
    }),
    false,
  );
  assert.equal(calls, 1);
});

test('产物仅预览该会话已关联工作区文件，拒绝越界与任意文件读取', async () => {
  const base = await mkdtemp(join(tmpdir(), 'team-artifacts-')),
    root = join(base, 'project'),
    directory = join(base, 'events'),
    registryPath = join(base, 'registry.json');
  try {
    await mkdir(root);
    await writeFile(registryPath, '{}');
    await writeFile(join(root, 'delivery.md'), '真实交付');
    await writeFile(join(root, 'unrelated.md'), '未关联');
    await writeFile(join(base, 'outside.md'), '越界');
    await ingest(directory, {
      kind: 'host-observation',
      cwd: root,
      sessionId: 'root',
      source: 'codex-app/list_threads',
    });
    await ingest(directory, {
      kind: 'task-report',
      cwd: root,
      sessionId: 'root',
      taskId: 'one',
      title: '交付',
      artifacts: [
        { title: '交付记录', reference: 'delivery.md', availability: 'available' },
        { title: '错误路径', reference: '../outside.md' },
      ],
    });
    const params = { root, directory, registryPath, rootSessionId: 'root', taskId: 'root:one' };
    const result = await readArtifact({ ...params, reference: 'delivery.md' });
    assert.equal(result.content, '真实交付');
    assert.equal(result.readOnly, true);
    await assert.rejects(readArtifact({ ...params, reference: 'unrelated.md' }), /未关联/);
    await assert.rejects(readArtifact({ ...params, reference: '../outside.md' }), /超出工作区/);
    await assert.rejects(
      readArtifact({ ...params, rootSessionId: 'other', reference: 'delivery.md' }),
      /任务/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
