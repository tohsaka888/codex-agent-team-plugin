export const eventTypes = { dispatch: '分派', message: '消息', reply: '回复', status: '状态' };
export function mergeInteractions(previous, incoming) {
  const map = new Map(previous.map((item) => [item.messageId, item]));
  for (const item of incoming) map.set(item.messageId, item);
  const instant = (item) => {
    const value = Date.parse(item.timestamp || item.recordedAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  return [...map.values()].sort(
    (a, b) =>
      instant(a) - instant(b) || a.sequence - b.sequence || a.messageId.localeCompare(b.messageId),
  );
}
export function filterInteractions(items, { task = '', agent = '', type = '' } = {}) {
  return items.filter(
    (item) =>
      (!task || item.taskId === task) &&
      (!type || item.type === type) &&
      (!agent ||
        (agent === '__unknown__'
          ? !item.fromRunId ||
            !item.toRunId ||
            item.from?.availability === 'unknown' ||
            item.to?.availability === 'unknown'
          : [item.fromRunId, item.toRunId].includes(agent))),
  );
}
export function replyLocation(items, item, filters) {
  const original = items.find((candidate) => candidate.messageId === item.replyTo);
  return !original
    ? { state: 'unknown' }
    : { state: filterInteractions([original], filters).length ? 'visible' : 'filtered', original };
}
export function identityLabel(identity, id) {
  return (identity?.agentName || '未知 Agent') + (id ? ' · ' + id : '');
}

export function reprojectInteractions(items, context) {
  const tasks = context?.snapshot?.tasks || [];
  const runs = tasks.flatMap((task) => task.runs || []);
  return items.map((item) => {
    const updated = { ...item };
    for (const side of ['from', 'to']) {
      const id = item[side + 'RunId'];
      const run = runs.find(
        (candidate) => candidate.runId === id && candidate.teamId === item.teamId,
      );
      if (run)
        updated[side] = {
          runId: id,
          agentName: run.agentName || null,
          nativeAgentId: run.nativeAgentId || null,
          role: run.role || null,
          availability: 'known',
        };
    }
    updated.taskAvailability = tasks.some(
      (task) => task.taskId === item.taskId && task.teamId === item.teamId,
    )
      ? 'known'
      : item.taskAvailability;
    return updated;
  });
}
