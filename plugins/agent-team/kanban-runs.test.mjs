import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderKanbanBoard } from './web/cards-view.mjs';
import { visibleTasks, kanbanCards, taskColumn } from './web/view-model.mjs';

const roles = ['Developer', 'UE', 'Font Research', 'Spec Reviewer', 'Standards Reviewer'];
const task = {
  id: 'fidelity',
  taskId: 'fidelity-v1',
  title: '视觉保真',
  role: 'Developer',
  businessStatus: 'running',
  executionStatus: 'running',
  runs: roles.map((role, i) => ({
    runId: 'run-' + i,
    role,
    agentName: '/root/' + i,
    executionStatus: i ? 'completed' : 'running',
  })),
};

test('同一工单五条执行都在 Kanban 上体现，不重复建业务卡', () => {
  const markup = renderKanbanBoard([task]);
  assert.equal((markup.match(/data-task="fidelity"/g) || []).length, 1);
  assert.match(markup, /父工单 · 5 项执行分工/);
  assert.equal((markup.match(/class="parent-icon"/g) || []).length, 5);
  assert.ok(!markup.includes('执行分工 · 所属工单'));
  for (const run of task.runs) {
    assert.ok(markup.includes(run.runId));
    assert.ok(markup.includes(run.role));
  }
  assert.match(markup, /0 工单 · 4 执行/);
  assert.match(markup, /1 工单 · 1 执行/);
});

test('执行卡独立分列，重复 runId 去重，失败不被父工单覆盖', () => {
  const cards = kanbanCards([
    {
      ...task,
      runs: [...task.runs, task.runs[0], { runId: 'failure', executionStatus: 'failed' }],
      currentRunId: 'run-0',
      executionStatus: 'completed',
    },
  ]);
  assert.equal(cards.length, 7);
  assert.equal(taskColumn(cards[0]), 'running');
  assert.equal(taskColumn(cards[1]), 'running');
  assert.equal(taskColumn(cards[2]), 'completed');
  assert.equal(taskColumn(cards.at(-1)), 'unknown');
  assert.equal(cards[1].parentTaskId, task.id);
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
  assert.equal(task.runs.length, 5);
});

test('执行卡名称优先独立名称，缺失时用父工单名称，不用角色冒充任务名称', () => {
  const cards = kanbanCards([
    {
      ...task,
      runs: [
        { runId: 'one', role: 'Developer' },
        { runId: 'two', title: '字体研究', role: 'UE' },
      ],
    },
  ]);
  assert.equal(cards[1].title, '视觉保真');
  assert.equal(cards[2].title, '字体研究');
});

test('参与角色及执行名称可筛选搜索到所属工单', () => {
  assert.equal(visibleTasks([task], '', 'UE').length, 1);
  assert.equal(visibleTasks([task], 'run-4', '').length, 1);
  assert.equal(visibleTasks([task], '', 'Architect').length, 0);
});
