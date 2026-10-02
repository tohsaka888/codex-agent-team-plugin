import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ReviewGate } from './review-gate.mjs';

const directory = fileURLToPath(new URL('../../.runtime/probe/reviews/', import.meta.url));
await mkdir(directory, { recursive: true });
const findings = [];
test('未批准方案阻止实际 dispatch，执行结束不自动验收，批准记录可恢复', async () => {
  const path = directory + '/gate-' + randomUUID() + '.json';
  const gate = await ReviewGate.open(path);
  let executions = 0;
  await assert.rejects(gate.dispatch(async () => executions++), /design review/);
  assert.equal(executions, 0);
  const approval = { stage: 'design', version: 1, decision: 'approved', reviewer: 'TEST_FIXTURE_NOT_REAL_USER', requestId: 'design-1' };
  await gate.submit(approval);
  await gate.submit(approval);
  assert.equal(Object.keys(gate.state.submissions).length, 1);
  await gate.dispatch(async () => executions++);
  assert.equal(executions, 1);
  assert.throws(() => gate.accept(), /release review/);
  await gate.submit({ ...approval, stage: 'release', requestId: 'release-1' });
  assert.equal((await ReviewGate.open(path)).accept().accepted, true);
  findings.push('未批准无调度；重复审批幂等；执行完成未自动验收；验收批准持久恢复');
});
test('退回、版本更新和冲突审批均不能绕过门槛', async () => {
  const gate = await ReviewGate.open(directory + '/gate-' + randomUUID() + '.json');
  const approval = { stage: 'design', version: 1, decision: 'rejected', reviewer: 'TEST_FIXTURE_NOT_REAL_USER', requestId: 'reject-1' };
  await gate.submit(approval);
  await assert.rejects(gate.dispatch(async () => assert.fail('must not run')), /design review/);
  await assert.rejects(gate.submit({ ...approval, decision: 'approved' }), /Conflicting duplicate/);
  await gate.submit({ ...approval, decision: 'approved', requestId: 'design-2' });
  await gate.dispatch(async () => {});
  await gate.submit({ ...approval, stage: 'release', decision: 'approved', requestId: 'release-2' });
  await gate.reviseDelivery();
  assert.equal(gate.canAccept(), false);
  await assert.rejects(gate.submit({ ...approval, stage: 'release', decision: 'approved', requestId: 'stale-release' }), /Stale/);
  await gate.revisePlan();
  assert.equal(gate.canImplement(), false);
  await assert.rejects(gate.submit({ ...approval, decision: 'approved', requestId: 'stale-design' }), /Stale/);
  findings.push('退回无调度；冲突重复拒绝；变更使旧批准失效；过期批准拒绝');
});
test.after(async () => {
  await writeFile(new URL('../../docs/research/review-gate-probe.json', import.meta.url), JSON.stringify({ scope: '确定性规则自动测试；审批由测试夹具提交，不是用户批准或身份认证验证', ok: findings.length === 2, findings }, null, 2) + '\n');
});
