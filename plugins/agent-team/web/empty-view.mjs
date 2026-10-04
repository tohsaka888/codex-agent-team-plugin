import { html } from './html.mjs';
import { escapeHtml as safe } from './trace-detail.mjs';
const icon = html`
  <svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="17" y="5" width="14" height="10" rx="3" />
    <path d="M24 15v9M10 32v-8h28v8" />
    <rect x="3" y="32" width="14" height="10" rx="3" />
    <rect x="31" y="32" width="14" height="10" rx="3" />
  </svg>
`;
export function renderEmpty(kind, { mode, workspace }) {
  const texts = {
    loading: ['正在同步会话', '正在读取团队活动，页面会在收到数据后自动更新。'],
    'session-required': [
      '选择一个主会话',
      '看板按主会话及其子 Agent 展示。通过 @Agent Team 启用时会绑定明确的会话标识，也可以从已观察会话中选择。',
    ],
    unobserved: [
      '尚未收到本会话的团队活动',
      '在原生 Codex 对话中开展团队任务后，已接入的任务与 Agent 会显示在这里。当前状态不代表没有任务。',
    ],
    unavailable: [
      '远程活动尚未接入',
      '此 SSH 项目已保存。当前阶段可查看项目清单，实时远程任务与 Agent 活动将在后续接入。',
    ],
    noTasks: [
      '还没有关联的任务',
      '已观察到原生活动，任务标题和阶段仍等待明确回报。切换 Agent Org Chart 可以查看已观察的 Agent。',
    ],
    noAgents: ['还没有可展示的 Agent', '任务回报与原生身份建立关联后，这里会显示真实执行层级。'],
    noMatches: ['没有匹配的任务', '请调整标题搜索或角色条件；筛选不会改变原生任务。'],
    error: ['暂时无法同步', '数据通道不可用，可以稍后刷新。原生 Codex 任务继续按自身流程执行。'],
  };
  const [title, description] = texts[kind] || texts.unobserved;
  const stages =
    mode === 'kanban'
      ? html`
          <div class="stage-guide" aria-label="任务阶段">
            <div>待开始</div>
            <div>进行中</div>
            <div>待评审</div>
            <div>执行完成</div>
          </div>
        `
      : '';
  return html`
    <div class="empty-wrap">
      ${stages}
      <section class="empty-state">
        ${icon}
        <h2>${safe(title)}</h2>
        <p>${safe(description)}</p>
        <button data-retry>刷新数据</button>
        <details>
          <summary>查看数据范围</summary>
          <p class="muted">
            仅显示已接入的原生事件与明确任务回报，不自动补全历史，不从执行结束推断验收。
          </p>
        </details>
        ${
          workspace
            ? html`
                <div class="path muted">${safe(workspace.hostName)} · ${safe(workspace.path)}</div>
              `
            : ''
        }
      </section>
      <p class="empty-note">查看、筛选与刷新均不会启动或改变任务</p>
    </div>
  `;
}
