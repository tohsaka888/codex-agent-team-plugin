import { escapeHtml as safe } from './trace-detail.mjs';
import {
  mergeInteractions,
  filterInteractions,
  eventTypes,
  identityLabel,
  replyLocation,
  reprojectInteractions,
} from './timeline-model.mjs';
import { eventCard, eventDetail } from './timeline-view.mjs';

// 更新内容时保留按钮节点，避免 pointerdown 与 click 之间刷新吞掉点击。
function patchNode(node, next) {
  if (node.nodeType !== next.nodeType || node.nodeName !== next.nodeName) {
    node.replaceWith(next.cloneNode(true));
    return;
  }
  if (node.nodeType === 3) {
    if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    return;
  }
  if (node.nodeType !== 1) return;
  for (const attribute of [...node.attributes])
    if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
  for (const attribute of [...next.attributes])
    if (node.getAttribute(attribute.name) !== attribute.value)
      node.setAttribute(attribute.name, attribute.value);
  const children = [...node.childNodes];
  [...next.childNodes].forEach((child, index) => {
    if (children[index]) patchNode(children[index], child);
    else node.appendChild(child.cloneNode(true));
  });
  for (const child of children.slice(next.childNodes.length)) child.remove();
}

function patchList(list, markup) {
  const template = document.createElement('div');
  template.innerHTML = markup;
  if (!template.querySelector('[data-event-id]')) {
    list.innerHTML = markup;
    return;
  }
  const existing = new Map(
    [...list.querySelectorAll('[data-event-id]')].map((node) => [node.dataset.eventId, node]),
  );
  let position = list.firstChild;
  for (const next of [...template.children]) {
    const node = existing.get(next.dataset.eventId) || next.cloneNode(true);
    if (existing.has(next.dataset.eventId)) patchNode(node, next);
    if (node !== position) list.insertBefore(node, position);
    position = node.nextSibling;
    existing.delete(next.dataset.eventId);
  }
  while (position) {
    const next = position.nextSibling;
    position.remove();
    position = next;
  }
}
export function createTimeline({ container, query, onOpenTask }) {
  let scope,
    scopeKey,
    token = 0,
    events = [],
    cursor = 0,
    selected = null,
    expanded = new Set(),
    filters = { task: '', agent: '', type: '' },
    lastSuccess = null,
    error = '',
    loading = false,
    busy = false,
    queued = false,
    loaded = false,
    newIds = new Set(),
    context,
    origin,
    signature = '';
  container.innerHTML = `<div class="timeline-heading"><h2>协作时间线</h2><span>仅展示已回报交互；未采集的历史不会补造</span></div><div class="timeline-filters"><label>任务 <select data-filter="task" aria-label="按任务筛选交互"><option value="">全部</option></select></label><label>Agent <select data-filter="agent" aria-label="按 Agent 筛选交互"><option value="">全部</option></select></label><label>事件 <select data-filter="type" aria-label="按事件类型筛选">${['', ...Object.keys(eventTypes)].map((type) => `<option value="${type}">${eventTypes[type] || '全部'}</option>`).join('')}</select></label><span class="timeline-order">声明/观测时间 · 最新在下</span></div><div class="timeline-banner" role="status"></div><div class="timeline-new" hidden><button data-new></button></div><div class="timeline-panels"><div class="timeline-list" tabindex="0" aria-label="协作交互列表"></div><aside class="timeline-detail" aria-label="事件详情"></aside></div>`;
  const list = container.querySelector('.timeline-list'),
    detail = container.querySelector('.timeline-detail'),
    banner = container.querySelector('.timeline-banner');
  function options() {
    const tasks = new Map(
      (context?.snapshot?.tasks || []).map((task) => [task.taskId, task.title || task.taskId]),
    );
    events.forEach((item) => {
      if (item.taskId && !tasks.has(item.taskId)) tasks.set(item.taskId, item.taskId);
    });
    const agents = new Map();
    events.forEach((item) => {
      for (const side of ['from', 'to'])
        if (item[side + 'RunId'])
          agents.set(item[side + 'RunId'], identityLabel(item[side], item[side + 'RunId']));
    });
    for (const [key, entries] of [
      ['task', tasks],
      ['agent', agents],
    ]) {
      const select = container.querySelector(`[data-filter="${key}"]`);
      const markup = `<option value="">全部</option>${[...entries].map(([value, label]) => `<option value="${safe(value)}">${safe(label)}</option>`).join('')}${key === 'agent' ? '<option value="__unknown__">未知身份</option>' : ''}`;
      if (select.dataset.signature !== markup) {
        select.innerHTML = markup;
        select.dataset.signature = markup;
      }
      select.value = filters[key];
    }
    container.querySelector('[data-filter="type"]').value = filters.type;
  }
  function measureMessages() {
    for (const button of list.querySelectorAll('[data-expand]')) {
      const message = button.closest('.timeline-event').querySelector('.timeline-message');
      if (typeof message.clientHeight === 'number' && typeof message.scrollHeight === 'number')
        button.hidden =
          !expanded.has(button.dataset.expand) && message.scrollHeight <= message.clientHeight + 1;
    }
  }
  globalThis.addEventListener?.('resize', measureMessages);
  function render() {
    options();
    banner.innerHTML = error
      ? `<span class="timeline-warning">连接中断 · ${safe(error)} · ${lastSuccess ? '显示最近快照 · 最近成功同步 ' + safe(lastSuccess.toLocaleTimeString()) : '尚无成功快照'}</span><button data-retry>重试同步</button>`
      : `<span class="muted">${loading ? '正在同步…' : '同步正常'}${lastSuccess ? ' · 最近成功同步 ' + safe(lastSuccess.toLocaleTimeString()) : ''}</span>`;
    const filtered = filterInteractions(events, filters);
    const markup =
      error && !loaded
        ? '<div class="timeline-empty"><h3>尚无成功快照</h3><p>连接中断，请重试同步。</p><button data-retry>重试同步</button></div>'
        : loading && !loaded
          ? '<div class="timeline-skeleton" aria-label="正在加载交互"><div></div><div></div><div></div></div>'
          : !events.length
            ? '<div class="timeline-empty"><h3>尚无已回报交互</h3><p>当前团队没有交互记录。未采集的历史不会自动补齐。</p><button data-coverage>查看数据范围</button></div>'
            : !filtered.length
              ? '<div class="timeline-empty"><h3>当前筛选无结果</h3><button data-clear>清除筛选</button></div>'
              : filtered
                  .map((item) =>
                    eventCard(
                      item,
                      item.messageId === selected,
                      expanded.has(item.messageId),
                      replyLocation(events, item, filters).state,
                    ),
                  )
                  .join('');
    const focus = document.activeElement;
    const focusId = list.contains(focus)
      ? focus?.dataset.select || focus?.dataset.expand || focus?.dataset.reply
      : null;
    const focusKind = focus?.dataset.select ? 'select' : focus?.dataset.expand ? 'expand' : 'reply';
    if (signature !== markup) {
      const scroll = list.scrollTop;
      const viewport = list.getBoundingClientRect?.();
      const anchor =
        viewport &&
        [...list.querySelectorAll('[data-event-id]')].find((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > viewport.top && rect.top < viewport.bottom;
        });
      const offset = anchor ? anchor.getBoundingClientRect().top - viewport.top : null;
      const anchorId = anchor?.dataset.eventId;
      patchList(list, markup);
      // 截断按钮决定卡片高度；先完成测量，再恢复阅读锚点。
      measureMessages();
      list.scrollTop = scroll;
      const restored = anchorId && list.querySelector(`[data-event-id="${CSS.escape(anchorId)}"]`);
      if (restored && offset !== null)
        list.scrollTop +=
          restored.getBoundingClientRect().top - list.getBoundingClientRect().top - offset;
      signature = markup;
      if (focusId)
        list
          .querySelector(`[data-${focusKind}="${CSS.escape(focusId)}"]`)
          ?.focus({ preventScroll: true });
    }
    const detailMarkup = eventDetail(
      events.find((item) => item.messageId === selected),
      events,
      filters,
    );
    if (detail.dataset.signature !== detailMarkup) {
      const scroll = detail.querySelector('.timeline-detail-scroll')?.scrollTop || 0;
      detail.innerHTML = detailMarkup;
      detail.dataset.signature = detailMarkup;
      if (detail.querySelector('.timeline-detail-scroll'))
        detail.querySelector('.timeline-detail-scroll').scrollTop = scroll;
    }
    measureMessages();
    container.classList.toggle('timeline-detail-open', Boolean(selected));
    container.querySelector('.timeline-new').hidden = !newIds.size;
    container.querySelector('[data-new]').textContent = `查看 ${newIds.size} 条新交互`;
  }
  function close() {
    selected = null;
    render();
    ((origin && list.querySelector(`[data-select="${CSS.escape(origin)}"]`)) || list).focus({
      preventScroll: true,
    });
  }
  function locate(id) {
    const item = events.find((event) => event.messageId === id);
    const target = item && replyLocation(events, item, filters);
    if (!target || target.state === 'unknown') {
      banner.textContent = '原消息未接入，暂不可定位';
      return;
    }
    if (target.state === 'filtered') {
      filters = { task: '', agent: '', type: '' };
    }
    selected = target.original.messageId;
    render();
    const node = list.querySelector(`[data-select="${CSS.escape(selected)}"]`);
    node?.scrollIntoView({ block: 'center', behavior: 'instant' });
    node?.focus({ preventScroll: true });
    origin = selected;
  }
  container.addEventListener('change', (event) => {
    if (event.target.dataset.filter) {
      filters[event.target.dataset.filter] = event.target.value;
      render();
    }
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.select) {
      selected = button.dataset.select;
      origin = button.dataset.select;
      render();
      detail.querySelector('[data-close]')?.focus({ preventScroll: true });
    } else if (button.dataset.expand) {
      const id = button.dataset.expand;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
    } else if (button.dataset.reply) locate(button.dataset.reply);
    else if (button.hasAttribute('data-close')) close();
    else if (button.hasAttribute('data-clear')) {
      filters = { task: '', agent: '', type: '' };
      render();
    } else if (button.hasAttribute('data-retry')) refresh();
    else if (button.hasAttribute('data-coverage'))
      banner.textContent =
        '来源为当前团队明确回报；未接入宿主或未同步的历史、工具输出和内部推理不会补造。';
    else if (button.hasAttribute('data-new')) {
      const id = [...newIds].find((value) =>
        filterInteractions(events, filters).some((item) => item.messageId === value),
      );
      newIds.clear();
      render();
      if (id)
        list
          .querySelector(`[data-event-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'instant' });
      else {
        filters = { task: '', agent: '', type: '' };
        render();
        list.scrollTop = list.scrollHeight;
      }
    } else if (button.dataset.task || button.dataset.run) {
      if (!onOpenTask(button.dataset.task, button.dataset.run))
        banner.textContent = '关联任务或执行未接入，暂不可打开';
    }
  });
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      close();
    }
  });
  async function refresh() {
    if (!scope || container.hidden) return;
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    loading = true;
    const current = token;
    const wasLoaded = loaded;
    render();
    try {
      let hasMore;
      do {
        const response = await query(scope, cursor);
        if (current !== token) return;
        if (
          response.teamId !== scope ||
          !Array.isArray(response.interactions) ||
          response.interactions.some(
            (item) => item.teamId !== scope || typeof item.messageId !== 'string',
          ) ||
          !Number.isSafeInteger(response.nextCursor) ||
          response.nextCursor < cursor
        )
          throw new Error('交互响应范围或游标不匹配');
        if (response.hasMore && response.nextCursor === cursor)
          throw new Error('交互分页游标未前进');
        const known = new Set(events.map((item) => item.messageId));
        if (wasLoaded)
          response.interactions.forEach((item) => {
            if (!known.has(item.messageId)) newIds.add(item.messageId);
          });
        events = reprojectInteractions(mergeInteractions(events, response.interactions), context);
        cursor = response.nextCursor;
        hasMore = response.hasMore;
        loaded = true;
        error = '';
        lastSuccess = new Date();
        render();
      } while (hasMore);
    } catch (failure) {
      if (current === token) error = failure.message;
    } finally {
      busy = false;
      loading = false;
      if (current === token) render();
      if (queued) {
        queued = false;
        refresh();
      }
    }
  }
  render();
  return {
    show(next, teamId, unavailable = false) {
      context = next;
      if (unavailable || !teamId) {
        banner.textContent = unavailable
          ? '旧 MCP 内嵌入口未接入交互时间线，请打开独立网页查看。'
          : '团队未绑定，请先选择已同步团队。';
        return;
      }
      const key = JSON.stringify([next?.selectedProjectId, teamId]);
      if (scopeKey !== key) {
        scopeKey = key;
        scope = teamId;
        token++;
        events = [];
        cursor = 0;
        selected = null;
        filters = { task: '', agent: '', type: '' };
        expanded.clear();
        newIds.clear();
        loaded = false;
        lastSuccess = null;
        error = '';
      }
      events = reprojectInteractions(events, next);
      render();
      return refresh();
    },
    refresh,
    offline(message) {
      error = message;
      render();
    },
  };
}
