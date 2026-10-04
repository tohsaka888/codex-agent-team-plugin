import { kanbanCards } from './view-model.mjs';
import { renderAgentCard } from './cards-view.mjs';
import { html } from './html.mjs';
import { escapeHtml as safe } from './trace-detail.mjs';
import { roleIcon, roleClass } from './role-visual.mjs';
import { orgRoleView, agentId } from './org-view.mjs';
import { taskState, taskTone } from './task-presentation.mjs';

export function executionRecords(task) {
  if (Array.isArray(task.runs)) return task.runs;
  return task.source === 'codex-host/native-turn' && task.nativeAgentId
    ? [{ ...task, runId: task.taskId, agentId: task.nativeAgentId }]
    : [];
}

// 身份树保留每个真实实例，不再按当前职责合并。
export function individualAgents(agents, tasks) {
  return agents.map((agent) => {
    const node = orgRoleView([agent], tasks)[0];
    return {
      ...node,
      role: agent.coordinationRole || node.role,
      orgNodeId: agentId(agent),
      parentOrgNodeId: agent.parentAgentId,
      allRuns: tasks.flatMap((t) =>
        executionRecords(t).filter((r) => (r.agentId || r.nativeAgentId) === agentId(agent)),
      ),
    };
  });
}

export function layoutDag(tasks, agents = [], measured = new Map()) {
  const normalized = tasks.map((task) => ({ ...task, runs: executionRecords(task) }));
  const cards = kanbanCards(normalized);
  const nodes = cards.map((task) => ({
    orgNodeId: (task.cardKind === 'execution' ? 'run:' : 'task:') + task.id,
    task,
    role: task.role,
    runs: task.cardKind === 'execution' ? task.runs : [],
    width: 320,
    height: measured.get((task.cardKind === 'execution' ? 'run:' : 'task:') + task.id) || 250,
  }));
  const parents = nodes.filter((n) => n.task.cardKind === 'task');
  const byTask = new Map(tasks.map((task, i) => [task.taskId || task.id, parents[i]]));
  const edges = [],
    warnings = [];
  for (const node of parents)
    for (const dependency of node.task.dependencies || []) {
      const from = byTask.get(dependency);
      if (from) edges.push({ from: from.orgNodeId, to: node.orgNodeId, kind: 'dependency' });
      else warnings.push('依赖目标未提供：' + dependency);
    }
  const ranks = new Map(),
    pending = new Set(parents.map((n) => n.orgNodeId));
  while (pending.size) {
    const ready = [...pending].filter((id) =>
      edges.filter((e) => e.to === id).every((e) => ranks.has(e.from)),
    );
    if (!ready.length) break;
    for (const id of ready) {
      ranks.set(
        id,
        Math.max(0, ...edges.filter((e) => e.to === id).map((e) => ranks.get(e.from) + 1)),
      );
      pending.delete(id);
    }
  }
  if (pending.size)
    warnings.push('循环依赖或受循环影响：' + pending.size + ' 个工单；异常边不绘为 DAG');
  for (const node of nodes) if (pending.has(node.orgNodeId)) node.unknown = true;
  const lastRank = Math.max(0, ...ranks.values()) + 1;
  for (const id of pending) ranks.set(id, lastRank);
  for (const [id, rank] of ranks) ranks.set(id, rank * 2);
  for (const node of nodes.filter((n) => n.task.cardKind === 'execution')) {
    const parent = parents.find((n) => n.task.id === node.task.parentTaskId);
    ranks.set(node.orgNodeId, ranks.get(parent.orgNodeId) + 1);
    edges.push({ from: parent.orgNodeId, to: node.orgNodeId, kind: 'membership' });
  }
  // 没有工单关联的真实 Agent 仍可见，不造任务或执行。
  for (const agent of individualAgents(agents, tasks)) {
    const id = agentId(agent);
    if (
      !agent.allRuns?.length &&
      !tasks.some(
        (t) =>
          t.agentId === id ||
          t.nativeAgentId === id ||
          t.runs?.some((r) => (r.agentId || r.nativeAgentId) === id),
      )
    ) {
      nodes.push({ ...agent, width: 320, height: 240 });
      ranks.set(agent.orgNodeId, 0);
    }
  }
  const rows = [...new Set(ranks.values())]
    .sort((a, b) => a - b)
    .map((rank) => nodes.filter((n) => ranks.get(n.orgNodeId) === rank));
  const width = Math.max(360, ...rows.map((row) => row.length * 364 - 44 + 480));
  let y = 32;
  for (const row of rows) {
    const span = row.length * 364 - 44;
    row.forEach((node, i) => Object.assign(node, { x: (width - span) / 2 + i * 364, y }));
    y += Math.max(...row.map((n) => n.height)) + 90;
  }
  return {
    nodes,
    edges: edges.filter(
      (e) => e.kind === 'membership' || (!pending.has(e.from) && !pending.has(e.to)),
    ),
    width,
    height: y,
    warnings,
  };
}

export function renderDagCard(node) {
  const task = node.task;
  return html`
    <button
      class="agent-card dag-card role-${roleClass(task.role)}"
      data-agent="${safe(node.orgNodeId)}"
      data-org-node="${safe(node.orgNodeId)}"
    >
      <span class="agent-heading">
        <span class="role-avatar">${roleIcon(task.role)}</span>
        <span class="agent-identity">
          <strong>${safe(task.role || '角色未知')}</strong>
          <span class="muted">${safe(task.taskId || task.id)}</span>
        </span>
        <span class="chip ${taskTone(task)}">${safe(taskState(task))}</span>
      </span>
      ${
        task.cardKind === 'execution'
          ? html`
              <span
                class="execution-parent execution-parent-link"
                aria-label="Parent: ${safe(task.parentTaskKey)}"
                title="Parent: ${safe(task.parentTaskKey)}"
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
          : html`
              <span class="task-caption">父工单 · ${task.executionCount} 项执行分工</span>
            `
      }
      <span class="task"><strong>${safe(task.title)}</strong></span>
      <span class="agent-foot">
        ${safe(task.cardKind === 'execution' ? task.agentName || 'Agent 未关联' : '业务工单')}${node.unknown ? ' · 依赖异常' : ''}
      </span>
    </button>
  `;
}

export function renderNativeGraphCard(agent, task, selected) {
  const displayTask = task
    ? {
        ...task,
        businessStatus: null,
        executionStatus: agent.executionStatus || 'unknown',
        executionUnreported: false,
        reviewPhase: 'unknown',
        currentRunId: null,
      }
    : null;
  const markup = renderAgentCard(agent, displayTask, selected);
  const runs = agent.allRuns || [];
  return markup
    .replace(
      '<span class="agent-foot">',
      html`
        <span class="dag-runs">
          ${runs
            .map(
              (run) => html`
                <span class="dag-run">
                  <strong>${safe(run.role || '职责未提供')}</strong>
                  <span>${safe(run.runId)} · ${safe(run.executionStatus || '未知')}</span>
                </span>
              `,
            )
            .join('')}
        </span>
        <span class="agent-foot"></span>
      `,
    )
    .replace('class="agent-card ', 'class="agent-card dag-card ')
    .replace('1 个执行实例', '1 个真实 Agent · ' + runs.length + ' 条执行记录');
}
