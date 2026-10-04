import { html } from './html.mjs';
import { checklist, reviewRecords } from '../traceability.mjs';
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function renderChecklist(task) {
  const items = checklist(task),
    passed = items.filter((i) => i.status === 'passed').length;
  const labels = {
    passed: '已核对完成',
    pending: '待核对',
    failed: '未通过',
    unknown: '未知 / 未核对',
  };
  return html`
    <section class="acceptance evidence">
      <h3>
        验收条件${
          items.length
            ? html`
                <span class="muted">${passed} / ${items.length}</span>
              `
            : ''
        }
      </h3>
      ${
        items.length
          ? html`
              <ul class="checklist">
                ${items
                  .map(
                    (i) => html`
                      <li class="criterion ${i.status}">
                        <span
                          class="check-mark"
                          role="checkbox"
                          aria-checked="${i.status === 'passed'}"
                          aria-disabled="true"
                          aria-label="${escapeHtml(i.label)}"
                        >
                          ${i.status === 'passed' ? '✓' : i.status === 'failed' ? '×' : ''}
                        </span>
                        <div>
                          <span>${escapeHtml(i.label)}</span>
                          <small>${labels[i.status]}</small>
                          ${
                            i.verifier
                              ? html`
                                  <small>
                                    ${i.verifier === 'human' ? '人工验收' : 'Agent 自主验证'} ·
                                    ${escapeHtml(i.method)} · AC
                                    ${escapeHtml(i.version || task.version || '未知')}
                                  </small>
                                `
                              : ''
                          }
                          ${
                            i.manualCheck
                              ? html`
                                  <p>入口：${escapeHtml(i.manualCheck.entry)}</p>
                                  <ol>
                                    ${i.manualCheck.steps
                                      .map(
                                        (step) => html`
                                          <li>${escapeHtml(step)}</li>
                                        `,
                                      )
                                      .join('')}
                                  </ol>
                                  <p>预期结果：${escapeHtml(i.manualCheck.expected)}</p>
                                `
                              : ''
                          }
                          ${
                            i.resultVersion
                              ? html`
                                  <small>
                                    结果 ${escapeHtml(i.resultVersion)} · SHA256
                                    ${escapeHtml(i.resultDigest?.slice(0, 12) || '未知')}
                                  </small>
                                `
                              : ''
                          }
                          ${
                            i.evidence
                              ? html`
                                  <p>
                                    ${escapeHtml(i.evidence)}${i.reportedBy ? ' · ' + escapeHtml(i.reportedBy) : ''}
                                  </p>
                                `
                              : ''
                          }
                        </div>
                      </li>
                    `,
                  )
                  .join('')}
              </ul>
            `
          : html`
              <p class="muted">AC 缺失 · 待补齐；执行结束不能代替验收。</p>
            `
      }
    </section>
  `;
}
export function renderReviews(
  task,
  { link = (_, label) => escapeHtml(label), reference = (value) => escapeHtml(value) } = {},
) {
  const records = reviewRecords(task?.reviewRecords);
  const phase =
    {
      awaiting_review: '待评审',
      repair_required: '待修正',
      passed: '已报告评审通过',
      unknown: '未回报评审阶段',
    }[task?.reviewPhase] || '未回报评审阶段';
  const labels = {
    passed: '通过',
    confirmed: '确认',
    changes_requested: '需修正',
    comment: '反馈',
  };
  return html`
    <section class="reviews evidence">
      <h3>评审记录</h3>
      <p class="muted">${phase}</p>
      ${
        records.length
          ? html`
              <ol class="review-timeline">
                ${records
                  .map(
                    (r) => html`
                      <li>
                        <div class="review-meta">
                          <span class="review-kind">
                            ${r.actorType === 'human' ? '人工评审' : 'Agent 评审'}
                          </span>
                          <span>
                            ${{ design: '方案确认', delivery: '交付评审', unspecified: '评审范围未回报' }[r.scope]}
                            · ${labels[r.decision]}
                          </span>
                        </div>
                        <strong>${escapeHtml(r.author || '评审者未回报')}</strong>
                        <p>${escapeHtml(r.summary)}</p>
                        <p class="muted">${escapeHtml(r.evidence || '未提供评审依据')}</p>
                        ${
                          r.reference
                            ? html`
                                <p>${reference(r.reference)}</p>
                              `
                            : ''
                        }${
                          r.targetId && r.targetVersion
                            ? html`
                                <p class="review-basis">
                                  对象 ${escapeHtml(r.targetId)} ·
                                  ${escapeHtml(r.targetVersion)}${
                                    r.targetDigest
                                      ? html`
                                          <span
                                            class="review-fingerprint"
                                            title="${escapeHtml(r.targetDigest)}"
                                          >
                                            SHA256 ${escapeHtml(r.targetDigest.slice(0, 12))}…
                                          </span>
                                        `
                                      : ' · 文件指纹未知'
                                  }
                                </p>
                              `
                            : html`
                                <p class="muted">对象版本未知；历史记录不用于当前版本确认。</p>
                              `
                        }
                        <div class="review-foot">
                          <time>
                            ${escapeHtml(
                              r.observedAt
                                ? new Date(r.observedAt).toLocaleString()
                                : '评审时间未回报',
                            )}
                          </time>
                          ${r.nativeAgentId ? link(r.nativeAgentId, '查看评审执行记录') : ''}
                        </div>
                      </li>
                    `,
                  )
                  .join('')}
              </ol>
            `
          : html`
              <p class="muted">未接入评审记录；阶段标签不能代替审查反馈或人工确认。</p>
            `
      }
      <p class="muted review-note">
        ${
          task?.acceptance?.humanStatus === 'not_required'
            ? '本卡无需人工核验；完成依据为当前 Agent 验证及审查。'
            : (
                  task?.acceptance
                    ? task.acceptance.humanStatus === 'accepted'
                    : records.some(
                        (r) =>
                          r.actorType === 'human' &&
                          r.scope === 'delivery' &&
                          ['passed', 'confirmed'].includes(r.decision),
                      )
                )
              ? '已接入人工交付确认，依据见上述记录。'
              : '当前结果尚待人工验收；历史确认不能替代当前结果。'
        }
      </p>
    </section>
  `;
}
