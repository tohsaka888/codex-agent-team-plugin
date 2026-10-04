import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ingest, readSnapshot } from './native-state.mjs';
import { readArtifact } from './artifact-reader.mjs';
import { writeFile } from 'node:fs/promises';
const digest = 'a'.repeat(64);
const requirement = {
  id: 'spec',
  kind: 'spec',
  title: '需求规格',
  version: 'v1',
  digest,
  reference: 'spec.md',
  applicability: 'required',
};
const confirmation = {
  id: 'confirm-spec',
  actorType: 'human',
  author: '用户',
  scope: 'design',
  decision: 'confirmed',
  summary: '确认Spec v1',
  evidence: '用户在明确提交Spec v1后回复确认',
  source: 'user-confirmation',
  targetId: 'spec',
  targetVersion: 'v1',
  targetDigest: digest,
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'team-human-review-'));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(join(tmpdir(), 'team-human-review-'))));
    await rm(directory, { recursive: true, force: true });
  });
  const base = {
    kind: 'task-report',
    cwd: directory,
    sessionId: 'root',
    taskId: 'one',
    title: '人工评审任务',
    executionStatus: 'queued',
  };
  await ingest(directory, {
    kind: 'host-observation',
    cwd: directory,
    sessionId: 'root',
    source: 'codex-app/list_threads',
  });
  return {
    report: (values) => ingest(directory, { ...base, ...values }),
    read: async () =>
      (
        await readSnapshot(
          directory,
          { hostId: 'local', path: directory, id: 'workspace' },
          { rootSessionId: 'root' },
        )
      ).tasks[0],
  };
}
test('只有人工明确确认对应产物版本与指纹后，快照显示该对象已确认', async (t) => {
  const f = await fixture(t);
  await f.report({ reviewRequirements: [requirement] });
  assert.equal((await f.read()).humanReview.status, 'awaiting_confirmation');
  await f.report({ reviewRecords: [confirmation] });
  const task = await f.read();
  assert.equal(task.humanReview.status, 'confirmed');
  assert.equal(task.humanReview.items[0].confirmation.author, '用户');
});
test('部分人工确认不掩盖其他对象等待，Agent通过不满足人工条件', async (t) => {
  const f = await fixture(t);
  const ui = { ...requirement, id: 'ui', kind: 'ui', title: 'UI原型', reference: 'ui.html' };
  await f.report({
    reviewRequirements: [requirement, ui],
    reviewRecords: [
      confirmation,
      {
        ...confirmation,
        id: 'agent-ui',
        actorType: 'agent',
        source: 'reviewer-result',
        targetId: 'ui',
      },
    ],
  });
  const task = await f.read();
  assert.deepEqual(
    task.humanReview.items.map((i) => i.status),
    ['confirmed', 'awaiting_confirmation'],
  );
  assert.equal(task.humanReview.status, 'awaiting_confirmation');
});
test('旧版本或指纹确认不适用于新版，历史保留且新确认仅影响对应范围', async (t) => {
  const f = await fixture(t);
  await f.report({ reviewRequirements: [requirement], reviewRecords: [confirmation] });
  await f.report({
    reviewRequirements: [{ ...requirement, version: 'v2', digest: 'b'.repeat(64) }],
  });
  let task = await f.read();
  assert.equal(task.humanReview.items[0].status, 'stale_confirmation');
  assert.equal(task.reviewRecords.length, 1);
  await f.report({
    reviewRecords: [{ ...confirmation, id: 'wrong-fingerprint', targetVersion: 'v2' }],
  });
  assert.equal((await f.read()).humanReview.status, 'awaiting_confirmation');
  await f.report({
    reviewRecords: [
      { ...confirmation, id: 'v2-confirmed', targetVersion: 'v2', targetDigest: 'b'.repeat(64) },
    ],
  });
  task = await f.read();
  assert.equal(task.humanReview.status, 'confirmed');
  assert.equal(task.reviewRecords.length, 3);
});
test('当前版本退回会覆盖旧通过，缺少适用性依据不能作为豁免', async (t) => {
  const f = await fixture(t);
  await f.report({ reviewRequirements: [requirement], reviewRecords: [confirmation] });
  await f.report({
    reviewRecords: [
      {
        ...confirmation,
        id: 'return',
        decision: 'changes_requested',
        source: 'user-feedback',
        summary: '需要修改',
      },
    ],
  });
  assert.equal((await f.read()).humanReview.status, 'changes_requested');
  await f.report({ reviewRequirements: [{ ...requirement, applicability: 'not_applicable' }] });
  assert.equal((await f.read()).humanReview.status, 'unknown');
  await f.report({
    reviewRequirements: [
      {
        ...requirement,
        applicability: 'not_applicable',
        reason: '已确认范围内仅修正错别字',
        reportedBy: 'Coordinator',
      },
    ],
  });
  assert.equal((await f.read()).humanReview.status, 'not_applicable');
});
test('评审要求中的文件可只读预览，仍拒绝未关联文件', async (t) => {
  const f = await fixture(t);
  const task = await (async () => {
    await f.report({ reviewRequirements: [requirement] });
    return f.read();
  })();
  const root = task.cwd;
  await writeFile(join(root, 'spec.md'), '真实评审材料');
  await writeFile(join(root, 'registry.json'), '{}');
  const params = {
    root,
    directory: root,
    registryPath: join(root, 'registry.json'),
    rootSessionId: 'root',
    taskId: 'root:one',
  };
  assert.equal((await readArtifact({ ...params, reference: 'spec.md' })).content, '真实评审材料');
  await assert.rejects(readArtifact({ ...params, reference: 'registry.json' }), /未关联/);
});

test('恢复后省略要求保留，显式清空不会推断豁免，设计确认不能确认交付', async (t) => {
  const f = await fixture(t);
  await f.report({ reviewRequirements: [requirement], reviewRecords: [confirmation] });
  await f.report({ activitySummary: '恢复后核对' });
  assert.equal((await f.read()).humanReview.status, 'confirmed');
  await f.report({ reviewRequirements: [{ ...requirement, kind: 'delivery' }] });
  assert.equal((await f.read()).humanReview.status, 'awaiting_confirmation');
  await f.report({ reviewRequirements: [] });
  assert.equal((await f.read()).humanReview.status, 'unreported');
});
test('普通意见和无效确认不能覆盖有效人工决定', async (t) => {
  const f = await fixture(t);
  await f.report({ reviewRequirements: [requirement], reviewRecords: [confirmation] });
  await f.report({
    reviewRecords: [
      { ...confirmation, id: 'comment', decision: 'comment', source: 'user-feedback' },
      { ...confirmation, id: 'bad', source: 'agent-result' },
    ],
  });
  assert.equal((await f.read()).humanReview.status, 'confirmed');
});

test('历史明确显示对象版本指纹，未知历史不追认，汇总转义并按对象去重', async () => {
  const { renderReviews } = await import('./web/trace-detail.mjs');
  const { renderReviewBanner, renderHumanReview } = await import('./web/human-review-view.mjs');
  const history = renderReviews({
    reviewRecords: [
      confirmation,
      { ...confirmation, id: 'old', targetVersion: 'v0', targetDigest: 'b'.repeat(64) },
      { ...confirmation, id: 'legacy', targetVersion: null, targetDigest: null },
    ],
  });
  assert.ok(history.includes('v0'));
  assert.ok(history.includes('b'.repeat(64)));
  assert.ok(history.includes('对象版本未知'));
  const task = {
    id: 'one',
    reviewRequirements: [{ ...requirement, title: '<img src=x onerror=alert(1)>' }],
  };
  const banner = renderReviewBanner([task, { ...task, id: 'two' }]);
  assert.ok(banner.includes('1 项人工评审'));
  assert.ok(banner.includes('2 个关联任务'));
  assert.ok(!banner.includes('<img'));
  assert.ok(renderHumanReview(task).includes('&lt;img'));
});
