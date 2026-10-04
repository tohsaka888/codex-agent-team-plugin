import { html } from './html.mjs';
import { escapeHtml as safe } from './trace-detail.mjs';
import { roleIcon, roleClass } from './role-visual.mjs';
import { taskLabel, agentLabel, taskColumn, kanbanCards } from './view-model.mjs';
import { taskState, taskTone, lifeLabels, labels } from './task-presentation.mjs';
import { reviewWait } from './human-review-view.mjs';
export function renderKanbanBoard(tasks, selectedTask) {
  const cards = kanbanCards(tasks);
  const groups = [
    ['queued', '待开始'],
    ['running', '进行中'],
    ['review', '待评审'],
    ['completed', '执行完成'],
  ];
  return html`
    <div class="board">
      ${groups
        .map(([key, label]) => {
          const columnTasks = cards.filter((task) => taskColumn(task) === key);
          const parents = columnTasks.filter((task) => task.cardKind === 'task').length;
          return html`
            <section class="column">
              <h2>
                <span class="stage-dot ${key}" aria-hidden="true"></span>
                <span>${label}</span>
                <span class="column-count">${columnTasks.length}</span>
                ${
                  columnTasks.some((task) => task.cardKind === 'execution')
                    ? html`
                        <small class="column-card-counts">
                          ${parents} 工单 · ${columnTasks.length - parents} 执行
                        </small>
                      `
                    : ''
                }
              </h2>
              <div class="column-body" data-column="${key}">
                ${
                  columnTasks.length
                    ? columnTasks.map((task) => renderTaskCard(task, selectedTask)).join('')
                    : html`
                        <p class="column-empty">此阶段暂无已关联任务</p>
                      `
                }
              </div>
            </section>
          `;
        })
        .join('')}
    </div>
  `;
}
export function renderTaskCard(task, selectedTask) {
  return html`
    <button
      class="card role-${roleClass(task.role)}"
      data-task="${safe(task.id)}"
      aria-pressed="${task.id === selectedTask}"
    >
      <span class="card-meta">
        <span class="task-key">${safe(task.taskId)}</span>
        <span class="role-badge" title="角色 / Agent">
          ${roleIcon(task.role)}${safe(taskLabel(task))}
        </span>
      </span>
      ${
        task.cardKind === 'execution'
          ? html`
              <span
                class="execution-parent execution-parent-link"
                title="Parent: ${safe(task.parentTaskKey)}"
                aria-label="Parent: ${safe(task.parentTaskKey)}"
              >
                <svg
                  class="parent-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="2" width="7" height="5" rx="1.5" />
                  <path d="M6.5 7v6h4" />
                  <rect x="11" y="10" width="6" height="6" rx="1.5" />
                </svg>
                ${safe(task.parentTaskKey)}
              </span>
            `
          : task.executionCount
            ? html`
                <span class="execution-parent">父工单 · ${task.executionCount} 项执行分工</span>
              `
            : ''
      }
      <strong>${safe(task.title)}</strong>
      <span class="card-activity">
        ${safe(task.activitySummary || task.goal || '当前活动未提供')}
      </span>
      ${renderCardExecutions(task)}
      ${
        task.dependencyWarning
          ? html`
              <span class="review-wait">${safe(task.dependencyWarning)}</span>
            `
          : ''
      }
      ${
        reviewWait(task)
          ? html`
              <span class="review-wait">${safe(reviewWait(task))}</span>
            `
          : ''
      }
      <span class="card-bottom">
        <span class="chip ${taskTone(task)}">${safe(taskState(task))}</span>
        ${
          task.agentName
            ? html`
                <span
                  class="run-name"
                  title="${safe(task.agentName)} · ${safe(task.nativeAgentId)}"
                >
                  ${safe(agentLabel(task))}
                </span>
              `
            : ''
        }
      </span>
    </button>
  `;
}
function renderCardExecutions(task) {
  if (task.cardKind) return '';
  const runs = task.runs || [];
  if (runs.length < 2) return '';
  const completed = runs.filter((run) => run.executionStatus === 'completed').length;
  return html`
    <span class="card-executions">
      <span class="execution-caption">
        关联执行 · ${runs.length}
        <span>${completed} 条已完成</span>
      </span>
      ${runs
        .map(
          (run) => html`
            <span class="card-execution" title="${safe(run.goal || '')}">
              <span class="execution-role">${safe(run.role || agentLabel(run))}</span>
              <span class="execution-state">${safe(labels[run.executionStatus] || '未知')}</span>
              <small>${safe(run.runId)} · ${safe(run.agentName || 'Agent 未关联')}</small>
            </span>
          `,
        )
        .join('')}
    </span>
  `;
}
export function renderAgentCard(agent, task, selectedOrg) {
  const state = task
    ? taskState(task)
    : agent.activeCount
      ? '活动实例 ' + agent.activeCount
      : lifeLabels[agent.lifecycle] || '未知';
  return html`
    <button
      class="agent-card role-${roleClass(agent.role)}"
      data-agent="${safe(agent.agentId || agent.nativeAgentId)}"
      data-org-node="${safe(agent.orgNodeId)}"
      aria-pressed="${selectedOrg === agent.orgNodeId}"
    >
      <span class="agent-heading">
        <span class="role-avatar">${roleIcon(agent.role)}</span>
        <span class="agent-identity">
          <strong>${safe(agent.role || '角色未知')}</strong>
          <span class="muted" title="${safe(agent.nativeAgentId)}">
            ${safe(task?.agentName || agent.agentName || '派生名称未报告')}
          </span>
        </span>
        <span class="chip ${task ? taskTone(task) : ''}">${safe(state)}</span>
      </span>
      <span class="task">
        <span class="task-caption">最近任务</span>
        <strong>${safe(task?.title || '最近任务未提供')}</strong>
      </span>
      <span class="agent-foot">
        ${safe(agent.members.length + ' 个执行实例')}${agent.activeCount ? ' · ' + agent.activeCount + ' 个活动中' : ''}
      </span>
    </button>
  `;
}
