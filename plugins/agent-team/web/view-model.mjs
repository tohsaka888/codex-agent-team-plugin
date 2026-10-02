export function visibleTasks(tasks,query='',role='') {
  const needle=query.trim().toLocaleLowerCase();
  return tasks.filter(task=>(!role||(task.role||'角色未知')===role)
    && (!needle||(task.title+' '+task.taskId).toLocaleLowerCase().includes(needle)));
}
export function taskColumn(task) {
  if(['failed','interrupted','blocked'].includes(task.executionStatus))return 'unknown';
  if(task.reviewPhase==='repair_required')return task.executionStatus==='running'?'running':'unknown';
  if(task.reviewPhase==='awaiting_review')return 'review';
  return ['queued','running','completed'].includes(task.executionStatus)?task.executionStatus:'unknown';
}
