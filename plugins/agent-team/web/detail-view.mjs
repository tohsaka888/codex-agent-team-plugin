import { html } from './html.mjs';
import { escapeHtml as safe, renderChecklist, renderReviews } from './trace-detail.mjs';
import { roleIcon } from './role-visual.mjs';
import { taskLabel } from './view-model.mjs';
import { labels, lifeLabels, time, taskState, taskTone } from './task-presentation.mjs';
import { renderHumanReview } from './human-review-view.mjs';
import { sessionUrl } from './session-url.mjs';

// 仅生成详情标记；事件绑定、焦点和滚动恢复由页面控制器负责。
export function renderDetailContent({
  task,
  agent,
  roleNode,
  data,
  projectList,
  agentTask,
  artifactLink,
}) {
  const taskAgent = task
    ? data.snapshot.agents.find((a) =>
        task.agentId
          ? a.agentId === task.agentId
          : task.nativeAgentId && a.nativeAgentId === task.nativeAgentId,
      )
    : null;
  const fields = task
    ? [
        ...(task.cardKind === 'execution'
          ? [
              ['卡片类型', '执行分工'],
              ['所属工单', task.parentTaskKey + ' · ' + task.parentTitle],
            ]
          : []),
        [
          '目标',
          task.goal ||
            (task.goalUnavailableReason === 'encrypted' ? '目标不可用（原生记录已加密）' : null),
        ],
        [task.role ? '负责角色' : '负责 Agent', taskLabel(task)],
        ['当前活动', task.activitySummary],
        ['最近活动', time(task.activityAt || task.observedAt)],
        [
          '依赖同步',
          task.dependencyWarning ||
            (task.blockedBy?.length ? '未完成依赖：' + task.blockedBy.join('、') : '无未完成依赖'),
        ],
      ]
    : [
        ['最近任务', agentTask(agent)?.title],
        ['当前活动', agent.activitySummary || agentTask(agent)?.activitySummary],
        ['该实例原生生命周期', lifeLabels[agent.lifecycle] || '未知'],
        ['最近活动', time(agent.activityAt || agentTask(agent)?.observedAt || agent.observedAt)],
      ];
  const diagnostic = task
    ? [
        ['负责 Agent', task.nativeAgentId || task.agentName || task.agentId],
        ['原生类型', taskAgent?.nativeRole],
        ['目标来源', task.goalSource],
        ['目标回报者', task.goalReportedBy],
        ['目标回报时间', task.goalReportedAt ? time(task.goalReportedAt) : null],
        ['目标依据', task.goalReference],
        ['活动来源', task.activitySource],
        ['名称来源', task.agentNameSource || taskAgent?.agentNameSource],
        ['执行配置', task.profile || '未报告（模型、推理与权限配置）'],
        ['原生标识来源', task.identitySource],
        ['任务阶段来源', task.source],
        ['职责原始回报', task.reportedRole || task.role],
        ['组织职责', taskAgent?.coordinationRole],
        ['回报时间', time(task.observedAt)],
      ]
    : [
        ['最近任务负责 Agent', agent.nativeAgentId],
        [
          '父 Agent',
          agent.parentAgentId || (agent.parentSessionId ? '未知 / 关系未提供' : '无已报告父级'),
        ],
        ['原生类型', agent.nativeRole],
        ['执行配置', agent.profile || '未报告（模型、推理与权限配置）'],
        ['标识来源', agent.source],
        ['父级关联来源', agent.parentSource],
        ['名称来源', agent.agentNameSource],
        ['观察时间', time(agent.observedAt)],
      ];
  const rows = (values) => html`
    <dl>
      ${values
        .map(
          ([name, value]) => html`
            <dt>${safe(name)}</dt>
            <dd>${safe(value || '未知 / 未提供')}</dd>
          `,
        )
        .join('')}
    </dl>
  `;
  const linkedTask = task || agentTask(agent);
  const workspace = projectList.find((p) => p.id === data.selectedProjectId);
  const executionLink = (id, label = '查看详细执行记录') => {
    const instance = id && data.snapshot.agents.find((a) => a.nativeAgentId === id);
    const url = instance
      ? sessionUrl(
          id,
          workspace?.hostId,
          instance.provider || (instance.source?.startsWith('team-sync/') ? 'unknown' : 'codex'),
        )
      : null;
    return url
      ? html`
          <a class="trace-link" href="#execution-record" data-navigation="${safe(url)}">
            ${safe(label)}
            <span aria-hidden="true">↗</span>
          </a>
        `
      : html`
          <span class="muted">执行记录不可用</span>
        `;
  };
  const evidence = renderEvidence(linkedTask, artifactLink);
  const runHistory = linkedTask?.runs?.length
    ? html`
        <section class="evidence">
          <h3>关联执行 · ${linkedTask.runs.length}</h3>
          <ul>
            ${linkedTask.runs
              .map(
                (run) => html`
                  <li>
                    <strong>${safe(run.agentName || run.runId)}</strong>
                    <span class="muted">
                      ${safe(run.role || '职责未提供')} ·
                      ${safe(labels[run.executionStatus] || '未知')} · ${safe(time(run.observedAt))}
                    </span>
                    <span class="reference">
                      ${safe(run.provider || 'common')} ·
                      ${safe(run.nativeAgentId || '宿主身份未提供')}
                    </span>
                    <span class="muted">
                      Profile：${safe(run.profile || '未提供')} ·
                      ${safe(run.activitySummary || '活动未提供')}
                    </span>
                    ${executionLink(run.nativeAgentId)}
                  </li>
                `,
              )
              .join('')}
          </ul>
        </section>
      `
    : '';
  const roleHistory = renderRoleHistory(roleNode, executionLink);
  const markup = html`
    <div class="detail-head">
      <h2>${safe(task?.title || agent.role || 'Agent 详情')}</h2>
      <button id="close" aria-label="关闭详情">×</button>
    </div>
    <div class="detail-scroll" tabindex="0" aria-label="详情正文">
      <div class="detail-summary">
        ${
          linkedTask
            ? html`
                <span class="task-key">${safe(linkedTask.taskId)}</span>
                <span class="chip ${taskTone(linkedTask)}">${safe(taskState(linkedTask))}</span>
              `
            : ''
        }
        <span class="detail-name">
          ${roleIcon(task?.role || agent?.role)}${safe(task?.agentName || taskAgent?.agentName || agent?.agentName || '派生名称未报告')}
        </span>
        ${executionLink(linkedTask?.nativeAgentId || agent?.nativeAgentId)}
      </div>
      <p class="navigation-error" role="status" hidden></p>
      ${renderHumanReview(linkedTask, {
        reference: (value, label) => artifactLink(linkedTask, value, label),
        taskLink: (id) => {
          const found = data.snapshot.tasks.find((t) => t.id === id || t.taskId === id);
          return found
            ? html`
                <button class="review-task-link" data-review-task="${safe(found.id)}">
                  ${safe(found.taskId)}
                </button>
              `
            : safe(id) + '（未接入）';
        },
      })}${rows(fields)}${renderChecklist(linkedTask)}
      <details class="review-history">
        <summary>确认依据与评审历史</summary>
        ${renderReviews(linkedTask, {
          link: executionLink,
          reference: (value) => artifactLink(linkedTask, value),
        })}
      </details>
      ${runHistory}${evidence}${roleHistory}
      <details class="diagnostic">
        <summary>数据来源与同步信息</summary>
        ${rows(diagnostic)}
      </details>
      <p class="muted detail-note">职责、派生名称及执行配置是不同概念；仅展示已接入记录。</p>
    </div>
  `;

  return { markup, linkedTask };
}

function renderEvidence(linkedTask, artifactLink) {
  const evidence = html`
    <section class="evidence">
      <h3>Skills 使用</h3>
      ${
        linkedTask?.skills?.length
          ? linkedTask.skills
              .map(
                (s) => html`
                  <p>
                    <strong>${safe(s.name)}</strong>
                    ·
                    ${s.usage === 'unavailable' ? '不可用 / 未使用' : s.usage === 'observed-read' ? '读取证据' : '已报告使用'}
                    <br />
                    <span class="muted">${safe(s.evidence)}</span>
                  </p>
                `,
              )
              .join('')
          : html`
              <p class="muted">未报告技能使用；安装不代表已使用</p>
            `
      }
      <h3>产物与验证证据</h3>
      ${
        linkedTask?.artifacts?.length
          ? linkedTask.artifacts
              .map(
                (a) => html`
                  <p>
                    <strong>${safe(a.title)}</strong>
                    ·
                    ${safe(
                      { available: '已核对存在', unavailable: '不可用', unknown: '可用性未知' }[
                        a.availability
                      ] || '可用性未知',
                    )}
                    <br />
                    <span class="reference">
                      ${
                        a.availability === 'unavailable'
                          ? safe(a.reference)
                          : artifactLink(linkedTask, a.reference)
                      }
                    </span>
                    <br />
                    <span class="muted">${safe(a.summary || '未提供摘要')}</span>
                  </p>
                `,
              )
              .join('')
          : html`
              <p class="muted">未报告产物证据</p>
            `
      }
    </section>
  `;

  return evidence;
}

function renderRoleHistory(roleNode, executionLink) {
  const taskRow = (t) => html`
    <li>
      <strong>${safe(t.title)}</strong>
      <span class="muted">
        ${safe(labels[t.executionStatus] || '未知')} · ${safe(time(t.observedAt))}
      </span>
      <span class="reference">Agent ${safe(t.nativeAgentId)}</span>
      <span class="muted">派生名 ${safe(t.agentName || '未报告')}</span>
      ${executionLink(t.nativeAgentId, '查看任务执行会话')}
    </li>
  `;
  const otherTasks = roleNode?.historyTasks || [],
    openTasks = otherTasks.filter(
      (t) =>
        ['queued', 'running', 'blocked', 'unknown'].includes(t.executionStatus) ||
        t.reviewPhase === 'awaiting_review' ||
        t.reviewPhase === 'repair_required',
    ),
    history = otherTasks.filter((t) => !openTasks.includes(t));
  const roleHistory = roleNode
    ? html`
        <section class="role-runs evidence">
          <details class="instance-history">
            <summary>执行实例 · ${roleNode.members.length}</summary>
            <ul>
              ${roleNode.members
                .map(
                  (a) => html`
                    <li>
                      <strong>${safe(a.agentName || '派生名称未报告')}</strong>
                      <span class="muted">
                        原生类型 ${safe(a.nativeRole || '未报告')} ·
                        ${safe(lifeLabels[a.lifecycle] || '未知')}
                      </span>
                      <span class="reference">${safe(a.nativeAgentId)}</span>
                    </li>
                  `,
                )
                .join('')}
            </ul>
          </details>
          ${
            openTasks.length
              ? html`
                  <h3>其他未完成任务 · ${openTasks.length}</h3>
                  <ul>
                    ${openTasks.map(taskRow).join('')}
                  </ul>
                `
              : ''
          }${
            history.length
              ? html`
                  <details class="task-history">
                    <summary>历史任务 · ${history.length}</summary>
                    <ul>
                      ${history.map(taskRow).join('')}
                    </ul>
                  </details>
                `
              : ''
          }
        </section>
      `
    : '';

  return roleHistory;
}
