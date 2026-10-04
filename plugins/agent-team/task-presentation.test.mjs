import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskState, taskTone } from './web/task-presentation.mjs';

test('失败红色、进行中蓝色、待办灰色，完成和评审保留原色', () => {
  for (const [executionStatus, tone] of Object.entries({
    failed: 'danger',
    running: 'info',
    queued: 'neutral',
    completed: 'warning',
    blocked: 'warning',
    unknown: '',
  }))
    assert.equal(taskTone({ executionStatus }), tone);
  assert.equal(taskTone({ executionStatus: 'failed', reviewPhase: 'awaiting_review' }), 'danger');
  assert.equal(
    taskTone({ executionStatus: 'completed', reviewPhase: 'awaiting_review' }),
    'warning',
  );
});

test('父工单颜色跟随业务标签，执行卡跟随自身状态，不被最近执行或旧评审覆盖', () => {
  const parent = {
    cardKind: 'task',
    businessStatus: 'running',
    executionStatus: 'completed',
    currentRunId: 'run',
  };
  assert.equal(taskState(parent), '进行中');
  assert.equal(taskTone(parent), 'info');
  assert.equal(taskTone({ ...parent, businessStatus: 'queued' }), 'neutral');
  assert.equal(taskTone({ ...parent, businessStatus: 'failed' }), 'danger');
  assert.equal(taskTone({ ...parent, businessStatus: 'blocked' }), 'warning');
  assert.equal(
    taskTone({ ...parent, businessStatus: 'completed', reviewPhase: 'repair_required' }),
    'warning',
  );
  assert.equal(taskTone({ cardKind: 'execution', executionStatus: 'failed' }), 'danger');
  assert.equal(taskTone({ executionUnreported: true }), 'info');
  assert.equal(taskTone({ ...parent, cardKind: null }), 'success');
});
