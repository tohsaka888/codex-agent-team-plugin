import { html } from './html.mjs';
import { humanReview } from '../human-review.mjs';
import { escapeHtml as safe } from './trace-detail.mjs';
const kinds = {
  spec: 'Spec',
  adr: 'ADR',
  ui: 'UI 原型',
  tickets: '工单批次',
  delivery: '交付验收',
  unknown: '对象类型未知',
};
const labels = {
  confirmed: '已人工确认',
  awaiting_confirmation: '待人工确认',
  stale_confirmation: '旧版确认不适用 · 新版待确认',
  changes_requested: '人工要求修正',
  not_applicable: '本任务不适用',
  unknown: '未知 / 依据待补',
};
const waiting = (item) => !['confirmed', 'not_applicable'].includes(item.status);
export function reviewWait(task) {
  const items = humanReview(task).items.filter(waiting);
  if (!items.length) return '';
  const first = items[0];
  return (
    (first.status === 'unknown'
      ? '人工评审依据待补'
      : first.status === 'changes_requested'
        ? '人工要求修正'
        : '待人工评审') +
    ' · ' +
    kinds[first.kind] +
    ' ' +
    (first.version || '版本未知') +
    (items.length > 1 ? ' 等 ' + items.length + ' 项' : '')
  );
}
export function renderHumanReview(
  task,
  { reference = (value) => safe(value), taskLink = (id) => safe(id) } = {},
) {
  const review = humanReview(task);
  if (!review.items.length)
    return html`
      <p class="muted review-unknown">
        ${task.acceptance?.humanStatus === 'not_required' ? '本卡无需人工核验。' : '人工评审要求未接入，不能从旧完成状态推断确认。'}
      </p>
    `;
  function row(item) {
    const confirmed = item.status === 'confirmed';
    return html`
      <div class="review-object ${confirmed ? 'confirmed' : waiting(item) ? 'waiting' : ''}">
        <div class="review-object-head">
          <strong>${safe(kinds[item.kind] + ' · ' + item.title)}</strong>
          <span class="review-version">${safe(item.version || '版本未知')}</span>
          <span class="chip ${confirmed ? 'success' : waiting(item) ? 'warning' : ''}">
            ${labels[item.status]}
          </span>
        </div>
        ${
          item.digest
            ? html`
                <span class="review-fingerprint" title="${safe(item.digest)}">
                  SHA256 ${safe(item.digest.slice(0, 12))}…
                </span>
              `
            : html`
                <span class="review-fingerprint">文件指纹未知</span>
              `
        }${
          item.reason
            ? html`
                <p>${safe(item.reason)}</p>
              `
            : ''
        }${
          item.reference
            ? html`
                <p>${reference(item.reference, '查看产物')}</p>
              `
            : html`
                <p>产物引用未知</p>
              `
        }${
          item.confirmation
            ? html`
                <p class="review-basis">
                  ${safe(item.confirmation.author || '评审者未知')} ·
                  ${safe(item.confirmation.evidence || '依据未知')}
                </p>
              `
            : item.historical.length
              ? html`
                  <p class="review-basis">
                    历史 ${safe(item.historical.at(-1).targetVersion)} 已确认，不适用于当前版本。
                  </p>
                `
              : ''
        }${
          item.applicability === 'not_applicable' && item.reportedBy
            ? html`
                <p class="review-basis">适用性判断：${safe(item.reportedBy)}</p>
              `
            : ''
        }${
          item.affectedTaskIds.length
            ? html`
                <p class="review-basis">
                  影响任务：${item.affectedTaskIds.map(taskLink).join('、')}
                </p>
              `
            : ''
        }
      </div>
    `;
  }
  const design = review.items.filter((i) => i.kind !== 'delivery'),
    delivery = review.items.filter((i) => i.kind === 'delivery');
  return html`
    <section class="human-review evidence">
      ${
        design.length
          ? html`
              <h3>实施前人工评审</h3>
              <p class="muted">
                仅针对当前产物版本 · ${design.filter(waiting).length} 项待确认 / 待补依据
              </p>
              ${design.map(row).join('')}
            `
          : ''
      }${
        delivery.length
          ? html`
              <h3>人工交付验收</h3>
              ${delivery.map(row).join('')}
            `
          : html`
              <p class="muted">人工交付验收尚未回报。</p>
            `
      }
      <p class="muted review-note">在原生对话中评审；此处仅展示协调者回报的依据。</p>
    </section>
  `;
}
export function renderReviewBanner(tasks) {
  const groups = new Map();
  for (const task of tasks)
    for (const item of humanReview(task).items.filter(waiting)) {
      const key = JSON.stringify([item.id, item.kind, item.version, item.digest]);
      if (!groups.has(key)) groups.set(key, { item, task, tasks: new Set() });
      groups.get(key).tasks.add(task.id);
    }
  if (!groups.size) return '';
  return html`
    <div class="review-banner-copy">
      <strong>待你决定 · ${groups.size} 项人工评审</strong>
      <span>按当前产物版本核对 · 独立探索可继续</span>
    </div>
    <div class="review-banner-links">
      ${[...groups.values()]
        .map(
          ({ item, task, tasks }) => html`
            <button data-review-task="${safe(task.id)}" title="${safe(item.title)}">
              ${safe(kinds[item.kind] + ' ' + (item.version || '版本未知'))} ·
              ${labels[item.status]}${tasks.size > 1 ? ' · ' + tasks.size + ' 个关联任务' : ''} →
            </button>
          `,
        )
        .join('')}
    </div>
  `;
}
