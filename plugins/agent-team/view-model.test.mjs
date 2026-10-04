import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleTasks, taskColumn, taskLabel } from './web/view-model.mjs';

test('动态 Agent 用真实名称展示和筛选，目标与活动可搜索，原始职责保留未知', () => {
  const task = {
    title: '原生任务',
    taskId: 'turn',
    role: null,
    agentName: '/root/mobile_analysis',
    goal: '核对移动端学习流程',
    activitySummary: '正在检查页面',
    nativeRole: 'explorer',
  };
  assert.equal(taskLabel(task), 'mobile_analysis');
  assert.deepEqual(visibleTasks([task], '学习', 'mobile_analysis'), [task]);
  assert.deepEqual(visibleTasks([task], '页面'), [task]);
  assert.equal(task.role, null);
  assert.equal(taskLabel({ ...task, role: 'Reviewer' }), 'Reviewer');
});
test('搜索和角色筛选只返回当前快照匹配任务，不修改原始记录', () => {
  const tasks = [
    { title: '核对原生 Agent', taskId: 'CAPTURE', role: 'Architect' },
    { title: '完善任务详情', taskId: 'DETAIL', role: 'Developer' },
  ];
  assert.deepEqual(visibleTasks(tasks, '原生', 'Architect'), [tasks[0]]);
  assert.deepEqual(visibleTasks(tasks, '详情', 'Architect'), []);
  assert.equal(tasks.length, 2);
});
test('明确待修正不显示成功，失败优先保留原始阶段', () => {
  assert.equal(
    taskColumn({ executionStatus: 'completed', reviewPhase: 'repair_required' }),
    'review',
  );
  assert.equal(
    taskColumn({ executionStatus: 'running', reviewPhase: 'repair_required' }),
    'running',
  );
  assert.equal(
    taskColumn({ executionStatus: 'failed', reviewPhase: 'awaiting_review' }),
    'unknown',
  );
});
