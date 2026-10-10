import { readTracking } from './skills/team-sync/scripts/tracking-core.mjs';
export async function readInteractions({
  workspace,
  dataDir,
  teamId,
  after = 0,
  limit = 100,
  taskId,
  runId,
  type,
} = {}) {
  if (!teamId) throw new Error('必须指定 teamId');
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('after 必须为非负整数');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error('limit 必须为 1 至 500');
  if (type && !['dispatch', 'message', 'reply', 'status'].includes(type))
    throw new Error('交互类型不可用');
  const snapshot = await readTracking({ workspace, dataDir });
  if (!snapshot.teams.some((team) => team.teamId === teamId)) throw new Error('团队不可用');
  const all = snapshot.interactions.filter((item) => item.teamId === teamId);
  const runs = snapshot.runs.filter((item) => item.teamId === teamId);
  const identity = (id) => {
    const run = runs.find((item) => item.runId === id);
    return {
      runId: id || null,
      agentName: run?.agentName || null,
      nativeAgentId: run?.nativeAgentId || null,
      role: run?.role || null,
      availability: run ? 'known' : 'unknown',
    };
  };
  const matches = all.filter(
    (item) =>
      item.sequence > after &&
      (!taskId || item.taskId === taskId) &&
      (!runId || [item.runId, item.fromRunId, item.toRunId].includes(runId)) &&
      (!type || item.type === type),
  );
  const page = matches.slice(0, limit);
  return {
    workspace: snapshot.workspace,
    teamId,
    after,
    nextCursor: page.length ? page.at(-1).sequence : Math.max(after, all.at(-1)?.sequence || 0),
    hasMore: matches.length > page.length,
    coverage: 'explicit-reports-only',
    interactions: page.map((item) => ({
      ...item,
      from: identity(item.fromRunId),
      to: identity(item.toRunId),
      taskAvailability: snapshot.tasks.some(
        (task) => task.teamId === teamId && task.taskId === item.taskId,
      )
        ? 'known'
        : 'unknown',
      replyToAvailability: item.replyTo
        ? all.some((original) => original.messageId === item.replyTo)
          ? 'known'
          : 'unknown'
        : null,
    })),
    readOnly: true,
  };
}
