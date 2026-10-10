import { escapeHtml as safe } from './trace-detail.mjs';
import { eventTypes, identityLabel, replyLocation } from './timeline-model.mjs';
const stamp = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.valueOf())
    ? date.toLocaleString('zh-CN', { hour12: false })
    : '未知';
};
const clock = (value) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
    : '未知';
const eventIcon = (type) => {
  const paths = {
    dispatch: '<path d="M4 7h10m-4-4 4 4-4 4M14 7v6a4 4 0 0 0 4 4h2"/>',
    message: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
    reply: '<path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12"/>',
    status: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${paths[type] || '<circle cx="12" cy="12" r="5"/>'}</svg>`;
};
export function eventCard(item, selected, expanded, replyState = 'visible') {
  return `<article class="timeline-event" data-event-id="${safe(item.messageId)}" data-type="${safe(item.type)}" ${selected ? 'data-selected="true"' : ''}>
  <div class="timeline-dot" aria-hidden="true">${eventIcon(item.type)}</div>
  <button class="timeline-event-select" data-select="${safe(item.messageId)}" aria-pressed="${selected}" aria-label="查看${safe(eventTypes[item.type] || '交互')}详情"><span class="timeline-badge">${safe(eventTypes[item.type] || '未知')}</span><strong>${safe(identityLabel(item.from, item.fromRunId))} → ${safe(identityLabel(item.to, item.toRunId))}</strong><time title="${safe(stamp(item.timestamp))}">${safe(clock(item.timestamp))}</time></button>
  <p class="timeline-message ${expanded ? '' : 'clamped'}">${safe(item.content || '正文未提供')}</p>
  ${item.content ? `<button class="timeline-link" data-expand="${safe(item.messageId)}" aria-expanded="${expanded}">${expanded ? '收起全文' : '展开全文'}</button>` : ''}
  ${item.replyTo ? (replyState === 'unknown' ? '<p class="timeline-warning">原消息未接入，暂不可定位</p>' : `<button class="timeline-link" data-reply="${safe(item.messageId)}">↳ ${replyState === 'filtered' ? '调整筛选并定位原消息' : '查看原消息'}</button>`) : ''}
  <div class="timeline-meta">任务 ${safe(item.taskId || '未知')} · 执行 ${safe(item.runId || item.fromRunId || '未知')} · 来源 ${safe(item.source || '未知')}</div>
  ${item.type === 'status' ? `<p class="timeline-status-note">状态观察 ${safe(item.status || '未知')} · 执行、Agent Review 与验收分别记录</p>` : ''}
  </article>`;
}
export function eventDetail(item, items, filters) {
  if (!item) return '<div class="timeline-detail-placeholder">选择一条交互查看详情</div>';
  const reply = replyLocation(items, item, filters);
  return `<header class="timeline-detail-head"><h2>${safe(eventTypes[item.type] || '交互')}详情</h2><button data-close aria-label="关闭事件详情">×</button></header><div class="timeline-detail-scroll" tabindex="0">
  <span class="timeline-badge" data-type="${safe(item.type)}">${safe(eventTypes[item.type] || '未知')}</span>
  <dl><dt>发送者</dt><dd>${safe(identityLabel(item.from, item.fromRunId))}</dd><dt>接收者</dt><dd>${safe(identityLabel(item.to, item.toRunId))}</dd><dt>原生身份</dt><dd>发送 ${safe(item.from?.nativeAgentId || '未知')}<br>接收 ${safe(item.to?.nativeAgentId || '未知')}</dd></dl>
  <h3>消息内容</h3><p class="timeline-message">${safe(item.content || '正文未提供')}</p>
  <section><h3>关联</h3><dl><dt>任务</dt><dd>${item.taskId ? `<button class="timeline-link" data-task="${safe(item.taskId)}">任务 ${safe(item.taskId)}</button>` : '未知'}</dd><dt>执行</dt><dd>${[...new Set([item.runId, item.fromRunId, item.toRunId].filter(Boolean))].map((id) => `<button class="timeline-link" data-run="${safe(id)}">${safe(id)}</button>`).join('<br>') || '未知'}</dd><dt>消息ID</dt><dd>${safe(item.messageId)}</dd></dl></section>
  ${item.replyTo ? `<section><h3>回复关系</h3><p class="muted">引用 ${safe(item.replyTo)}</p>${reply.state === 'unknown' ? '<p class="timeline-warning">原消息未接入，暂不可定位</p>' : `<p class="timeline-message timeline-original">${safe(reply.original.content)}</p><button class="timeline-link" data-reply="${safe(item.messageId)}">${reply.state === 'filtered' ? '调整筛选并定位原消息' : '定位原消息'}</button>`}</section>` : ''}
  <section><h3>来源与时间</h3><dl><dt>来源</dt><dd>${safe(item.source || '未知')}</dd><dt>声明/观测</dt><dd>${safe(stamp(item.timestamp))}<br><small>由生产者回报；不保证原生工具精确发生时间</small></dd><dt>归档时间</dt><dd>${safe(stamp(item.recordedAt))}</dd><dt>归档序号</dt><dd>${safe(item.sequence)}</dd></dl></section>
  <p class="muted">仅展示已回报事实；执行、Agent Review 与验收分别记录。</p></div>`;
}
