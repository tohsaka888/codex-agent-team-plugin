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
  assert.equal(taskColumn(cards[2]), 'review');
  assert.equal(taskColumn(cards.at(-1)), 'unknown');
  assert.equal(cards[1].parentTaskId, task.id);
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
  assert.equal(task.runs.length, 5);
});

test('执行名称使用独立名称和目标，缺失时不复制父工单标题', () => {
  const cards = kanbanCards([
    {
      ...task,
      runs: [
        { runId: 'one', role: 'Developer' },
        { runId: 'two', title: '字体研究', role: 'UE' },
        { runId: 'three', goal: '核验 DAG 独立节点' },
        { runId: 'four', title: '  ', name: '独立布局研究', goal: '完整研究目标' },
        { runId: 'five', title: '最终复查', goal: '完整复查目标' },
      ],
    },
  ]);
  assert.equal(cards[1].title, '执行 · one');
  assert.equal(cards[2].title, '字体研究');
  assert.equal(cards[3].title, '核验 DAG 独立节点');
  assert.equal(cards[4].title, '独立布局研究');
  assert.equal(cards[5].title, '最终复查');
  assert.equal(
    visibleTasks([{ ...task, runs: [{ runId: 'r', title: '唯一分工名称' }] }], '唯一分工名称')
      .length,
    1,
  );
});

test('参与角色及执行名称可筛选搜索到所属工单', () => {
  assert.equal(visibleTasks([task], '', 'UE').length, 1);
  assert.equal(visibleTasks([task], 'run-4', '').length, 1);
  assert.equal(visibleTasks([task], '', 'Architect').length, 0);
});
