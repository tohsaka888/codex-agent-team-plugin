import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  mergeInteractions,
  filterInteractions,
  replyLocation,
  reprojectInteractions,
} from './web/timeline-model.mjs';
import { eventCard, eventDetail } from './web/timeline-view.mjs';
import { createTimeline } from './web/timeline.mjs';
const message = (messageId, sequence, extra = {}) => ({
  teamId: 'demo',
  messageId,
  sequence,
  type: 'message',
  content: '实际正文',
  source: 'explicit',
  timestamp: '2026-10-09T00:00:00Z',
  recordedAt: '2026-10-09T00:00:01Z',
  fromRunId: 'one',
  toRunId: 'two',
  taskId: '03',
  ...extra,
});
const context = {
  selectedProjectId: 'workspace-one',
  snapshot: {
    tasks: [
      {
        teamId: 'demo',
        taskId: '03',
        title: '时间线',
        runs: [
          { teamId: 'demo', runId: 'one', agentName: '相同名字', nativeAgentId: 'real-one' },
          { teamId: 'demo', runId: 'two', agentName: '相同名字' },
        ],
      },
    ],
  },
};
test('真实时刻而非ISO字面排序，同瞬间sequence/id稳定，重试去重', () => {
  const first = message('first', 1, { timestamp: '2026-10-09T08:00:00+08:00' }),
    second = message('second', 2, { timestamp: '2026-10-09T01:00:00Z' }),
    equal = message('equal', 3, { timestamp: '2026-10-09T00:00:00Z' });
  assert.deepEqual(
    mergeInteractions([second], [equal, first, second]).map((item) => item.messageId),
    ['first', 'equal', 'second'],
  );
});
test('任务/双方run/type组合筛选，同名不合并；回复筛选隐藏与真正未知分开', () => {
  const original = message('original', 1),
    reply = message('reply', 2, {
      type: 'reply',
      replyTo: 'original',
      fromRunId: 'two',
      toRunId: 'one',
    }),
    unknown = message('unknown', 3, { fromRunId: null, toRunId: null });
  const items = [original, reply, unknown];
  assert.equal(
    filterInteractions(items, { task: '03', agent: 'two', type: 'reply' })[0].messageId,
    'reply',
  );
  assert.equal(filterInteractions(items, { agent: '__unknown__' }).length, 1);
  assert.equal(replyLocation(items, reply, { type: 'reply' }).state, 'filtered');
  assert.equal(replyLocation(items, { replyTo: 'missing' }, {}).state, 'unknown');
});
test('身份晚补只用明确同团队run元数据，旧事件重新投影', () => {
  const item = message('old', 1, { from: { availability: 'unknown' } });
  const projected = reprojectInteractions([item], context)[0];
  assert.equal(projected.from.agentName, '相同名字');
  assert.equal(projected.from.nativeAgentId, 'real-one');
  assert.equal(projected.to.nativeAgentId, null);
  assert.equal(
    reprojectInteractions([{ ...item, teamId: 'other' }], context)[0].from.availability,
    'unknown',
  );
});
test('事件纯文本转义与未知字段、状态验收区别，回复明确调整筛选', () => {
  const item = message('safe', 1, {
    type: 'reply',
    replyTo: 'missing',
    content: '<script>danger()</script>\n<img onerror=bad>',
  });
  const { document } = parseHTML(
    '<div>' + eventCard(item, true, false, 'filtered') + eventDetail(item, [item], {}) + '</div>',
  );
  assert.equal(document.querySelectorAll('script,img').length, 0);
  assert.match(
    document.textContent || document.querySelector('div').textContent,
    /调整筛选并定位原消息/,
  );
  assert.match(document.querySelector('div').textContent, /原消息未接入/);
  assert.match(
    eventCard(message('state', 2, { type: 'status', status: 'completed' }), false, false),
    /Agent Review 与验收分别记录/,
  );
});
test('真实DOM分页/刷新保留阅读和选择，新事件去重按钮、断线保留及恢复、Esc焦点节点定位', async (t) => {
  const { document, window } = parseHTML(
    '<html><body><section id="timeline"></section></body></html>',
  );
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    ...descriptor,
    set(value) {
      for (const option of this.querySelectorAll('option'))
        option.selected = option.value === value;
    },
  });
  const oldDocument = globalThis.document,
    oldCSS = globalThis.CSS;
  globalThis.document = document;
  globalThis.CSS = { escape: (value) => value };
  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.CSS = oldCSS;
  });
  const original = message('original', 1),
    reply = message('reply', 2, { type: 'reply', replyTo: 'original' }),
    incoming = message('new', 3);
  let cycle = 0,
    fail = false;
  const container = document.getElementById('timeline');
  let focused;
  const oldFocus = window.HTMLElement.prototype.focus;
  const oldScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.focus = function () {
    focused = this.dataset?.select;
  };
  t.after(() => {
    window.HTMLElement.prototype.focus = oldFocus;
    window.HTMLElement.prototype.scrollIntoView = oldScrollIntoView;
    Object.defineProperty(window.HTMLSelectElement.prototype, 'value', descriptor);
  });
  const control = createTimeline({
    container,
    query: async (team, after) => {
      if (fail) throw new Error('offline');
      if (after === 0)
        return { teamId: team, interactions: [original], nextCursor: 1, hasMore: true };
      if (after === 1)
        return { teamId: team, interactions: [reply], nextCursor: 2, hasMore: false };
      return {
        teamId: team,
        interactions: cycle ? [incoming] : [],
        nextCursor: cycle ? 3 : 2,
        hasMore: false,
      };
    },
    onOpenTask: () => false,
  });
  await control.show(context, 'demo');
  assert.equal(container.querySelectorAll('.timeline-event').length, 2);
  const originalButton = container.querySelector('[data-select="original"]');
  const replyButton = container.querySelector('[data-select="reply"]');
  container.querySelector('[data-select="reply"]').click();
  assert.ok(
    container.querySelector('[data-select="reply"]') === replyButton,
    '选择不能替换正在点击的节点',
  );
  assert.ok(container.querySelector('[data-select="original"]') === originalButton);
  assert.match(container.querySelector('.timeline-detail').textContent, /引用 original/);
  const list = container.querySelector('.timeline-list');
  list.scrollTop = 81;
  cycle = 1;
  await control.refresh();
  assert.equal(
    container.querySelector('[data-select="reply"]'),
    replyButton,
    '刷新插入新事件不能吞掉指针按下后的点击',
  );
  originalButton.click();
  replyButton.click();
  for (let index = 0; index < 40; index++) {
    const expected = index % 2 ? replyButton : originalButton;
    expected.click();
    assert.equal(expected.getAttribute('aria-pressed'), 'true');
    if (index % 5 === 0) await control.refresh();
    assert.ok(container.querySelector('[data-select="reply"]') === replyButton);
  }
  container.querySelector('.timeline-detail [data-reply="reply"]').click();
  assert.equal(originalButton.getAttribute('aria-pressed'), 'true', '原消息定位保持原按钮和选择');
  replyButton.click();
  originalButton.click();
  assert.equal(originalButton.getAttribute('aria-pressed'), 'true', '快速交替点击旧节点仍能切换');
  replyButton.click();
  assert.equal(list.scrollTop, 81);
  assert.equal(
    container.querySelector('[data-select="reply"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.match(container.querySelector('[data-new]').textContent, /1 条/);
  fail = true;
  await control.refresh();
  assert.match(container.querySelector('.timeline-banner').textContent, /连接中断/);
  assert.equal(container.querySelectorAll('.timeline-event').length, 3);
  fail = false;
  await control.refresh();
  assert.equal(container.querySelectorAll('.timeline-event').length, 3);
  container.querySelector('[data-close]').click();
  assert.equal(focused, 'reply');
  fail = true;
  await control.show({ selectedProjectId: 'workspace-two', snapshot: { tasks: [] } }, 'other-team');
  assert.equal(container.querySelectorAll('.timeline-event').length, 0);
  assert.equal(container.querySelectorAll('.timeline-skeleton').length, 0);
  assert.match(container.querySelector('.timeline-list').textContent, /尚无成功快照/);
});
