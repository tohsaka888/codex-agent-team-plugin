import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTracking } from './portable-state.mjs';
import { kanbanCards } from './web/view-model.mjs';
import { renderDetailContent } from './web/detail-view.mjs';

test('skill evidence stays scoped to each execution and renders the same usage as its parent', () => {
  const raw = {
    teams: [{ teamId: 'app' }],
    tasks: [{ teamId: 'app', taskId: '01', title: '实现反馈' }],
    runs: [
      {
        teamId: 'app',
        taskId: '01',
        runId: 'dev',
        title: '实现等待反馈',
        skills: [
          { name: 'tdd', status: 'read', evidence: '实际读取 SKILL.md' },
          { name: 'implement-spec', status: 'applied', evidence: '当前切片产物与检查' },
          { name: 'imagegen', status: 'unavailable', evidence: '工具不可用' },
        ],
      },
      { teamId: 'app', taskId: '01', runId: 'review', title: '独立复核' },
    ],
  };
  const snapshot = projectTracking(raw, 'team:app');
  const [parent, dev, review] = kanbanCards(snapshot.tasks);
  assert.deepEqual(
    dev.skills.map((s) => s.usage),
    ['observed-read', 'reported-use', 'unavailable'],
  );
  assert.deepEqual(parent.skills, dev.skills);
  assert.deepEqual(review.skills, []);
  const render = (task) =>
    renderDetailContent({
      task,
      agent: null,
      roleNode: null,
      data: { snapshot },
      projectList: [],
      agentTask: () => null,
      artifactLink: (_, value) => value,
    }).markup;
  for (const card of [parent, dev]) {
    const markup = render(card);
    assert.match(markup, /tdd[\s\S]*?读取证据/);
    assert.match(markup, /implement-spec[\s\S]*?已报告使用/);
    assert.match(markup, /imagegen[\s\S]*?不可用 \/ 未使用/);
  }
  assert.match(render(review), /未报告技能使用；安装不代表已使用/);
  assert.ok(!render(review).includes('实际读取 SKILL.md'));
  assert.equal(raw.runs[0].skills[0].usage, undefined);
});
