import { taskColumn as column } from './view-model.mjs';
export const labels = {
  queued: '待开始',
  running: '进行中',
  completed: '执行完成',
  failed: '失败',
  interrupted: '已中断',
  blocked: '阻塞',
  unknown: '未知',
};
export const lifeLabels = {
  active: '活动中',
  idle: '空闲',
  stopped: '已结束',
  interrupted: '已中断',
  notLoaded: '未加载',
  unknown: '未知',
};
export const time = (value) => (value ? new Date(value).toLocaleString() : '未知');
export function taskState(task) {
  if (task.acceptance?.humanStatus === 'rejected') return '待修正 · 人工退回';
  if (
    task.businessStatus === 'completed' ||
    (!task.businessStatus && task.executionStatus === 'completed')
  )
    return task.acceptance?.accepted ? '验收完成' : '执行结束 · 验收待完成';
  if (task.cardKind === 'task' && task.businessStatus)
    return taskState({ ...task, cardKind: null, currentRunId: null });
  if (task.executionUnreported) return '业务进行中 · 执行未同步';
  if (
    ['queued', 'running'].includes(task.businessStatus) &&
    task.currentRunId &&
    task.executionStatus !== task.businessStatus
  )
    return (
      (task.executionStatus === 'completed'
        ? '本轮执行完成'
        : labels[task.executionStatus] || '未知') +
      ' · 业务' +
      labels[task.businessStatus]
    );
  if (task.businessStatus)
    return (
      {
        queued: '待开始',
        running: '进行中',
        awaiting_review: '待评审',
        repair_required: '待修正',
        blocked: '业务阻塞',
        completed: '执行完成',
        failed: '失败',
        interrupted: '已中断',
      }[task.businessStatus] || '未知'
    );
  if (task.source === 'codex-host/native-turn' && task.executionStatus === 'completed')
    return '本轮执行完成';
  return task.reviewPhase === 'repair_required'
    ? '待修正 · ' + (labels[task.executionStatus] || '未知')
    : column(task) === 'review'
      ? '待评审'
      : labels[task.executionStatus] || '未知';
}
export function taskTone(task) {
  if (
    task.acceptance?.humanStatus === 'rejected' ||
    ((task.businessStatus === 'completed' ||
      (!task.businessStatus && task.executionStatus === 'completed')) &&
      !task.acceptance?.accepted)
  )
    return 'warning';
  if (task.cardKind === 'task' && task.businessStatus)
    return taskTone({ ...task, cardKind: null, currentRunId: null });
  if (task.executionUnreported) return 'info';
  const status =
    ['queued', 'running'].includes(task.businessStatus) && task.currentRunId
      ? task.executionStatus
      : task.businessStatus || task.executionStatus;
  if (status === 'failed') return 'danger';
  if (
    ['blocked', 'awaiting_review', 'repair_required'].includes(status) ||
    (!task.businessStatus && task.reviewPhase === 'repair_required') ||
    column(task) === 'review'
  )
    return 'warning';
  return { completed: 'success', running: 'info', queued: 'neutral' }[status] || '';
}
