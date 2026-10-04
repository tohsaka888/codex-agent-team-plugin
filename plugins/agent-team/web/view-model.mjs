export const agentLabel = (value) =>
  value?.agentName?.split('/').filter(Boolean).at(-1) || value?.nativeRole || '角色未知';
export const taskLabel = (task) => task.role || agentLabel(task);
// 展示投影：父工单与执行分别有稳定卡片 ID，不写入业务工单。
export function kanbanCards(tasks) {
  return tasks.flatMap((task) => {
    const runs = [
      ...new Map(
        (task.runs || []).filter((run) => run.runId).map((run) => [run.runId, run]),
      ).values(),
    ];
    const parent = { ...task, cardKind: 'task', executionCount: runs.length };
    return [
      parent,
      ...runs.map((run) => ({
        ...run,
        id: JSON.stringify(['execution', task.id, run.runId]),
        taskId: run.runId,
        title:
          [run.title, run.name, run.goal]
            .find((value) => typeof value === 'string' && value.trim())
            ?.trim() || '执行 · ' + run.runId,
        cardKind: 'execution',
        parentTaskId: task.id,
        parentTaskKey: task.taskId,
        parentTitle: task.title,
        businessStatus: null,
        currentRunId: null,
        reviewPhase: 'unknown',
        runs: [run],
        acceptanceItems: run.acceptanceItems || [],
        acceptance: run.acceptance,
        acceptanceItemsReported: true,
        reviewRecords: run.reviewRecords || [],
        reviewRequirements: run.reviewRequirements || [],
        executionStatus: run.executionStatus || run.status || 'unknown',
      })),
    ];
  });
}
export function visibleTasks(tasks, query = '', role = '') {
  const needle = query.trim().toLocaleLowerCase();
  return tasks.filter(
    (task) =>
      (!role || taskLabel(task) === role || task.runs?.some((run) => taskLabel(run) === role)) &&
      (!needle ||
        [
          task.title,
          task.taskId,
          task.agentName,
          task.goal,
          task.activitySummary,
          ...(task.runs || []).flatMap((run) => [
            run.runId,
            run.title,
            run.name,
            run.role,
            run.agentName,
            run.goal,
            run.activitySummary,
          ]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(needle)),
  );
}
export function taskColumn(task) {
  if (task.acceptance?.humanStatus === 'rejected')
    return task.executionStatus === 'running' ? 'running' : 'review';
  if (
    (task.businessStatus === 'completed' ||
      (!task.businessStatus && task.executionStatus === 'completed')) &&
    !task.acceptance?.accepted
  )
    return 'review';
  if (task.businessStatus) {
    if (task.businessStatus === 'awaiting_review') return 'review';
    if (['blocked', 'repair_required', 'failed', 'interrupted'].includes(task.businessStatus))
      return 'unknown';
    if (['queued', 'running', 'completed'].includes(task.businessStatus))
      return task.cardKind !== 'task' && task.businessStatus !== 'completed' && task.currentRunId
        ? ['queued', 'running', 'completed'].includes(task.executionStatus)
          ? task.executionStatus
          : 'unknown'
        : task.businessStatus;
  }
  if (['failed', 'interrupted', 'blocked'].includes(task.executionStatus)) return 'unknown';
  if (task.reviewPhase === 'repair_required')
    return task.executionStatus === 'running' ? 'running' : 'unknown';
  if (task.reviewPhase === 'awaiting_review') return 'review';
  return ['queued', 'running', 'completed'].includes(task.executionStatus)
    ? task.executionStatus
    : 'unknown';
}

export function acceptanceSummary(task) {
  const state = task.acceptance;
  if (!state || state.missing) return 'AC 缺失 · 待补齐';
  return `AC ${state.items.length} 项 · Agent ${state.agentPassed}/${state.agentTotal} · ${state.humanStatus === 'not_required' ? '无需人工核验' : state.humanStatus === 'accepted' ? '人工已验收' : state.humanStatus === 'rejected' ? '人工退回' : '人工待验收'}`;
}
