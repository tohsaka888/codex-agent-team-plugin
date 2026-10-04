import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderTaskCard, renderAgentCard, renderKanbanBoard } from './web/cards-view.mjs';
import { renderDetailContent } from './web/detail-view.mjs';
import { renderEmpty } from './web/empty-view.mjs';

const task = {
  id: 'task" onfocus="attack',
  taskId: 'turn',
  title: '<script>attack</script>',
  role: null,
  agentName: '/root/mobile_analysis',
  nativeAgentId: '01a100ff-a6c1-72b0-ad81-51167b69484f',
  executionStatus: 'running',
  activitySummary: '检查页面\n保留第二行',
  goal: '分析 <img src=x onerror=attack> 布局',
};
function documentOf(markup) {
  return parseHTML(`<html><body>${markup}</body></html>`).document;
}

test('复合职责保留完整文字并使用主职责图标，未知职责不猜角色', () => {
  const document = documentOf(renderTaskCard({ ...task, role: 'Coordinator / UE' }, task.id));
  assert.ok(document.querySelector('.card.role-coordinator'));
  assert.ok(document.querySelector('.role-glyph.role-coordinator'));
  assert.match(document.querySelector('.role-badge').textContent, /Coordinator \/ UE/);
  const unknown = documentOf(renderTaskCard({ ...task, role: 'Custom / UE' }, task.id));
  assert.ok(unknown.querySelector('.card.role-unknown'));
});

test('完整 Kanban 的四个阶段在同一 grid 容器内，任务和空态属于各自列', () => {
  const document = documentOf(renderKanbanBoard([task], task.id));
  const board = document.querySelector('.board');
  assert.equal(board.children.length, 4);
  assert.equal(document.querySelectorAll('.board > .column').length, 4);
  assert.equal(document.querySelectorAll('body > .column').length, 0);
  assert.equal(board.querySelector('[data-column="running"] .card').dataset.task, task.id);
  assert.equal(board.querySelectorAll('.column-empty').length, 3);
  assert.equal(board.querySelector('.card').getAttribute('aria-pressed'), 'true');
});

test('卡片模板保留选中属性、动态名称及活动，用户文本不能生成可执行标签或属性', () => {
  const document = documentOf(renderTaskCard(task, task.id));
  const button = document.querySelector('.card');
  assert.equal(button.dataset.task, task.id);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.hasAttribute('onfocus'), false);
  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('strong').textContent.trim(), task.title);
  assert.equal(document.querySelector('.role-badge').textContent.trim(), 'mobile_analysis');
  assert.equal(document.querySelector('.card-activity').textContent.trim(), task.activitySummary);
});

test('详情模板保留动态Agent目标、字段和导航，组织历史与空态独立渲染', () => {
  const agent = {
    nativeAgentId: task.nativeAgentId,
    agentName: task.agentName,
    lifecycle: 'active',
  };
  const roleNode = {
    ...agent,
    orgNodeId: 'node',
    members: [agent],
    historyTasks: [{ ...task, id: 'old', executionStatus: 'completed' }],
  };
  const data = { selectedProjectId: 'project', snapshot: { tasks: [task], agents: [agent] } };
  const context = {
    task,
    agent,
    roleNode,
    data,
    projectList: [{ id: 'project', hostId: 'local' }],
    agentTask: () => task,
    artifactLink: () => '',
  };
  const { markup, linkedTask } = renderDetailContent(context);
  const document = documentOf(markup);
  assert.equal(linkedTask, task);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('script'), null);
  assert.ok([...document.querySelectorAll('dd')].some((el) => el.textContent.trim() === task.goal));
  assert.ok(
    [...document.querySelectorAll('dt')].some((el) => el.textContent.trim() === '负责 Agent'),
  );
  assert.equal(
    document.querySelector('[data-navigation]').dataset.navigation,
    'codex://threads/' + task.nativeAgentId,
  );
  assert.ok(document.querySelector('.detail-scroll'));
  assert.ok(document.querySelector('.instance-history'));
  assert.ok(document.querySelector('.task-history'));
  const unavailable = documentOf(
    renderDetailContent({
      ...context,
      task: { ...task, goal: null, goalUnavailableReason: 'encrypted' },
    }).markup,
  );
  assert.ok(unavailable.body.textContent.includes('目标不可用（原生记录已加密）'));
  const card = documentOf(renderAgentCard(roleNode, task, roleNode.orgNodeId));
  assert.equal(card.querySelector('[data-org-node]').getAttribute('aria-pressed'), 'true');
  const empty = documentOf(renderEmpty('error', { mode: 'kanban', workspace: null }));
  assert.equal(empty.querySelectorAll('.stage-guide > div').length, 4);
  assert.ok(empty.querySelector('[data-retry]'));
});
