import { basename, resolve } from 'node:path';
import { acceptanceItems, reviewRecords } from './traceability.mjs';
import { humanReview, reviewRequirements } from './human-review.mjs';

const key = (...parts) => JSON.stringify(parts);
const at = (value) => value.observedAt || value.updatedAt || null;
const latest = (values) => [...values].sort((a, b) => String(at(a)).localeCompare(String(at(b))));
const sessionId = (team) => team.rootSessionId || 'team:' + team.teamId;
const instanceId = (run) =>
  run.provider === 'codex' && run.nativeAgentId
    ? run.nativeAgentId
    : key(
        'instance',
        run.teamId,
        run.provider || 'common',
        run.nativeAgentId ? ['native', run.nativeAgentId] : ['run', run.runId],
      );

// 协调是组织责任；复合回报中的另一项明确职责才是该工单的工作职责。
export function workRole(role) {
  const parts = String(role || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  const work = parts.filter((part) => part.toLowerCase() !== 'coordinator');
  return parts.length === 2 && work.length === 1 ? work[0] : role || null;
}

export function projectTracking(raw, selectedSessionId) {
  const teams = raw.teams || [];
  const selectedTeams = teams.filter((t) => sessionId(t) === selectedSessionId);
  const selectedById = new Map(selectedTeams.map((t) => [t.teamId, t]));
  const sessions = [
    ...new Map(
      teams
        .map((t) => ({
          id: sessionId(t),
          teamId: t.teamId,
          title: t.title || t.teamId,
          provider: t.provider || 'common',
          lastActivityAt: at(t) || raw.lastEventAt,
        }))
        .map((s) => [s.id, s]),
    ).values(),
  ];
  const teamRuns = latest((raw.runs || []).filter((r) => selectedById.has(r.teamId)));
  const runMap = new Map(teamRuns.map((r) => [key(r.teamId, r.runId), r]));
  const runs = teamRuns.map((run) => ({
    ...run,
    skills: (run.skills || []).map((skill) => ({
      ...skill,
      usage:
        skill.status === 'unavailable'
          ? 'unavailable'
          : skill.status === 'read'
            ? 'observed-read'
            : 'reported-use',
    })),
    acceptanceItems: acceptanceItems(run.acceptance?.items || run.acceptanceItems),
    acceptanceItemsReported: true,
    reviewRecords: projectReviews(run.reviewRecords, teamRuns, run.reviewRequirements),
    reviewRequirements: reviewRequirements(
      currentRequirements(run)
        .filter(
          (r) =>
            !r.itemId ||
            (run.acceptanceItems || []).some((i) => i.id === r.itemId && i.verifier === 'human'),
        )
        .map((r) => ({
          ...r,
          kind: r.type === 'visual' ? 'ui' : r.type,
          title: r.label || r.id,
          applicability: 'required',
          reportedBy: r.producer,
        })),
    ),
    artifacts: (run.artifacts || []).map((a) => ({
      ...a,
      title: a.label || a.reference,
      availability: 'available',
    })),
    reportedRole: run.role || null,
    role: workRole(run.role),
    agentId: instanceId(run),
    nativeAgentId: run.nativeAgentId || null,
    parentAgentId:
      run.parentRunId &&
      runMap.has(key(run.teamId, run.parentRunId)) &&
      instanceId(runMap.get(key(run.teamId, run.parentRunId))) !== instanceId(run)
        ? instanceId(runMap.get(key(run.teamId, run.parentRunId)))
        : null,
    executionStatus: run.status || 'unknown',
    observedAt: at(run),
    activitySummary: run.activitySummary || run.activities?.at(-1)?.summary || null,
    activityAt: run.activitySummaryAt || run.activities?.at(-1)?.timestamp || at(run),
    agentNameSource: run.agentName ? 'team-sync/run' : null,
    activitySource:
      run.activitySource ||
      (run.activities?.length
        ? 'team-sync/activity'
        : run.activitySummary
          ? 'team-sync/run'
          : null),
    source: 'team-sync/' + (run.provider || 'common'),
  }));
  const tasks = (raw.tasks || [])
    .filter((t) => selectedById.has(t.teamId))
    .map((task) => {
      const team = selectedById.get(task.teamId);
      const linked = runs.filter((r) => r.teamId === task.teamId && r.taskId === task.taskId);
      const latestByAgent = [...new Map(linked.map((r) => [r.agentId, r])).values()];
      const activeRuns = latestByAgent.filter((r) => r.executionStatus === 'running');
      const unsuccessfulRuns = latestByAgent.filter((r) =>
        ['failed', 'interrupted'].includes(r.executionStatus),
      );
      const current = latest(activeRuns).at(-1) || latest(unsuccessfulRuns).at(-1) || linked.at(-1);
      const businessStatus = task.status || 'queued';
      const dependencies = task.dependencies || [];
      const missing = dependencies.filter(
        (id) =>
          !raw.tasks.some(
            (t) =>
              t.teamId === task.teamId &&
              t.taskId === id &&
              t.status === 'completed' &&
              t.acceptance?.accepted,
          ),
      );
      // 依赖的完成回报可能迟于实际执行；不能把明确进行中的业务/运行改成未开始阻塞。
      const blocked = missing.length > 0 && businessStatus === 'queued' && !activeRuns.length;
      const result = {
        ...task,
        id: key('team', task.teamId, 'task', task.taskId),
        sessionId: selectedSessionId,
        businessStatus: blocked ? 'blocked' : businessStatus,
        executionStatus: blocked
          ? 'blocked'
          : ['queued', 'running'].includes(businessStatus) && current
            ? current.executionStatus
            : ['queued', 'running', 'completed', 'blocked', 'failed', 'interrupted'].includes(
                  businessStatus,
                )
              ? businessStatus
              : current?.executionStatus || 'queued',
        reviewPhase: ['awaiting_review', 'repair_required'].includes(businessStatus)
          ? businessStatus
          : null,
        currentRunId: current?.runId || null,
        agentId: current?.agentId || null,
        nativeAgentId: current?.nativeAgentId || null,
        provider: current?.provider || team.provider || 'common',
        reportedRole: task.role || current?.reportedRole || null,
        role: workRole(task.role || current?.role),
        agentName: current?.agentName || null,
        agentNameSource: current?.agentNameSource || null,
        identitySource:
          current?.identitySource ||
          (current?.nativeAgentId ? 'team-sync/run/native-agent-id' : null),
        profile: current?.profile || null,
        runs: linked,
        activitySummary: blocked
          ? '业务依赖未完成：' + missing.join('、')
          : (businessStatus === 'blocked' ? task.blockedReason : null) ||
            current?.activitySummary ||
            task.activitySummary ||
            null,
        activityAt: current?.activityAt || at(task),
        activitySource: blocked
          ? 'team-sync/task/dependencies'
          : businessStatus === 'blocked' && task.blockedReason
            ? 'team-sync/task'
            : current?.activitySummary
              ? current.activitySource
              : task.activitySummary
                ? 'team-sync/task'
                : null,
        observedAt: at(task),
        goal: task.goal || null,
        goalSource: 'team-sync/task',
        goalReportedBy: task.goalReportedBy || null,
        goalReportedAt: task.goalReportedAt || null,
        goalReference: task.goalEventId
          ? '归档事件 ' + task.goalEventId + '（' + task.teamId + '/' + task.taskId + '）'
          : null,
        source: 'team-sync/' + (team.provider || 'common'),
        acceptanceItems: acceptanceItems(task.acceptance?.items || task.acceptanceItems),
        acceptanceItemsReported: true,
        reviewRecords: reviewRecords(
          (task.reviewRecords || []).map((r) => ({
            ...r,
            actorType: r.authorType,
            nativeAgentId:
              r.authorType === 'agent'
                ? linked.find((run) => run.runId === r.runId)?.nativeAgentId
                : null,
            summary:
              (r.quote || r.evidence || '') +
              (r.scope && !['design', 'delivery'].includes(r.scope) ? ' · 范围：' + r.scope : ''),
            decision:
              r.decision === 'approved'
                ? r.authorType === 'human'
                  ? 'confirmed'
                  : 'passed'
                : r.decision === 'rejected'
                  ? 'changes_requested'
                  : 'comment',
            scope: ['design', 'delivery'].includes(r.scope)
              ? r.scope
              : task.reviewRequirements?.find((q) => q.id === r.requirementId)?.type === 'delivery'
                ? 'delivery'
                : 'design',
            source:
              r.authorType === 'human'
                ? r.decision === 'rejected'
                  ? 'user-feedback'
                  : 'user-confirmation'
                : 'agent-review',
            targetId: r.requirementId,
            targetVersion: r.version,
            targetDigest: r.digest,
            observedAt: at(r),
          })),
        ),
        reviewRequirements: reviewRequirements(
          currentRequirements(task)
            .filter(
              (r) =>
                !r.itemId ||
                (task.acceptanceItems || []).some(
                  (i) => i.id === r.itemId && i.verifier === 'human',
                ),
            )
            .map((r) => ({
              ...r,
              kind: r.type === 'visual' ? 'ui' : r.type,
              title: r.label || r.id,
              applicability: 'required',
              reportedBy: r.producer,
              affectedTaskIds: (r.affectedTaskIds || [task.taskId]).map((id) =>
                key('team', task.teamId, 'task', id),
              ),
            })),
        ),
        artifacts: (task.artifacts || []).map((a) => ({
          ...a,
          title: a.label || a.reference,
          availability: 'available',
        })),
        skills: linked.flatMap((r) => r.skills),
        blockedBy: missing,
        dependencyWarning:
          missing.length && !blocked ? '依赖完成状态未同步：' + missing.join('、') : null,
        executionUnreported: businessStatus === 'running' && !linked.length,
      };
      result.humanReview = humanReview(result);
      return result;
    });
  const agents = new Map();
  for (const run of runs) {
    const old = agents.get(run.agentId);
    agents.set(run.agentId, {
      ...run,
      parentAgentId: run.parentAgentId || old?.parentAgentId || null,
      parentSessionId:
        run.parentRunId && !runMap.has(key(run.teamId, run.parentRunId)) ? run.parentRunId : null,
      // 运行回报不能证明宿主实例已经停止；原生观察在合并时补充。
      lifecycle: 'unknown',
      runIds: [...(old?.runIds || []), run.runId],
      currentTaskId:
        tasks.find((t) => t.teamId === run.teamId && t.taskId === run.taskId)?.id || null,
      role: run.role || null,
      nativeRole: run.nativeRole || null,
    });
  }
  return {
    sessions,
    tasks,
    agents: [...agents.values()],
    unassociated: [],
    coverage: selectedTeams.length ? 'partial' : 'unobserved',
    lastEventAt: raw.lastEventAt || null,
    capturedAt: new Date().toISOString(),
    revision: raw.eventCount || 0,
    note: '通用 Skill 同步；仅展示实际接入记录，生命周期覆盖以宿主能力为准。',
  };
}

// 旧版交付保留在原始归档；当前人工待办只针对当前结果与合同。
function currentRequirements(target) {
  return (target.reviewRequirements || []).filter(
    (r) =>
      (!r.acKey || !target.acKey || r.acKey === target.acKey) &&
      (r.type !== 'delivery' ||
        !r.resultDigest ||
        !target.resultDigest ||
        r.resultDigest === target.resultDigest),
  );
}

function projectReviews(records = [], runs = [], requirements = []) {
  return reviewRecords(
    records.map((r) => ({
      ...r,
      actorType: r.authorType,
      nativeAgentId:
        r.authorType === 'agent' ? runs.find((run) => run.runId === r.runId)?.nativeAgentId : null,
      summary:
        (r.quote || r.evidence || '') +
        (r.scope && !['design', 'delivery'].includes(r.scope) ? ' · 范围：' + r.scope : ''),
      scope: ['design', 'delivery'].includes(r.scope)
        ? r.scope
        : requirements.find((q) => q.id === r.requirementId)?.type === 'delivery'
          ? 'delivery'
          : 'design',
      decision:
        r.decision === 'approved'
          ? r.authorType === 'human'
            ? 'confirmed'
            : 'passed'
          : r.decision === 'rejected'
            ? 'changes_requested'
            : 'comment',
      source:
        r.authorType === 'human'
          ? r.decision === 'rejected'
            ? 'user-feedback'
            : 'user-confirmation'
          : 'agent-review',
      targetId: r.requirementId,
      targetVersion: r.version,
      targetDigest: r.digest,
      observedAt: at(r),
    })),
  );
}

export async function readPortableState({ root, dataDir, projectId, rootSessionId, teamId } = {}) {
  const { readTracking } = await import('./skills/team-sync/scripts/tracking-core.mjs');
  let raw = await readTracking({ workspace: root, dataDir });
  if (teamId) {
    if (!raw.teams.some((team) => team.teamId === teamId)) throw new Error('团队不可用');
    raw = {
      ...raw,
      teams: raw.teams.filter((team) => team.teamId === teamId),
      tasks: raw.tasks.filter((task) => task.teamId === teamId),
      runs: raw.runs.filter((run) => run.teamId === teamId),
    };
    rootSessionId = sessionId(raw.teams[0]);
  }
  const project = {
    id: key('local', resolve(root)),
    projectId: null,
    hostId: 'local',
    hostName: '本机',
    kind: 'local',
    name: basename(root),
    path: resolve(root),
    lastActivityAt: raw.lastEventAt,
    source: '明确配置的追踪工作区',
    connectionStatus: 'local',
  };
  if (projectId && projectId !== project.id) throw new Error('Workspace 已移除或不可用');
  const chosen =
    rootSessionId || (latest(raw.teams).at(-1) ? sessionId(latest(raw.teams).at(-1)) : null);
  const snapshot = projectTracking(raw, chosen);
  const sessions = snapshot.sessions;
  delete snapshot.sessions;
  return {
    schemaVersion: 1,
    source: '可移植 Skills 同步',
    projects: [project],
    sessions,
    selectedProjectId: project.id,
    selectedRootSessionId: chosen,
    sessionSelectionSource: rootSessionId ? 'explicit' : 'recent-team',
    scope: 'session',
    snapshotAt: new Date().toISOString(),
    snapshot,
    readOnly: true,
    capabilities: { nativeNavigation: false, transport: 'http-or-mcp' },
  };
}

export async function mergePortable(state, { dataDir } = {}) {
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (project?.hostId !== 'local') return state;
  const { readTracking } = await import('./skills/team-sync/scripts/tracking-core.mjs');
  let raw;
  try {
    raw = await readTracking({ workspace: project.path, dataDir });
  } catch (error) {
    if (error.code === 'ENOENT') return state;
    throw error;
  }
  if (!raw.teams.length) return state;
  const chosen = state.selectedRootSessionId || sessionId(latest(raw.teams).at(-1));
  raw = reconcileNativeRuns(raw, state.snapshot, chosen);
  const added = projectTracking(raw, chosen);
  state.sessions = [
    ...state.sessions,
    ...added.sessions.filter((s) => !state.sessions.some((old) => old.id === s.id)),
  ];
  state.selectedRootSessionId = chosen;
  if (added.coverage !== 'partial') return state;
  const identities = new Set(
    added.agents
      .filter((a) => a.provider === 'codex' && a.nativeAgentId)
      .map((a) => a.nativeAgentId),
  );
  state.snapshot.tasks = [
    ...state.snapshot.tasks.filter(
      (t) => !identities.has(t.nativeAgentId) || t.source !== 'codex-host/native-turn',
    ),
    ...added.tasks,
  ];
  const observedAgents = new Map(state.snapshot.agents.map((a) => [a.nativeAgentId, a]));
  state.snapshot.agents = [
    ...state.snapshot.agents.filter((a) => !identities.has(a.nativeAgentId)),
    ...added.agents.map((a) => {
      const original =
        a.provider === 'codex' && a.nativeAgentId ? observedAgents.get(a.nativeAgentId) : null;
      return original
        ? {
            ...original,
            ...a,
            parentAgentId: a.parentAgentId || original.parentAgentId || null,
            parentSessionId: a.parentAgentId ? a.parentSessionId : original.parentSessionId,
            parentSource: a.parentAgentId ? a.source : original.parentSource,
            nativeRole: a.nativeRole || original.nativeRole,
            lifecycle: original.lifecycle || 'unknown',
            coordinationRole:
              !original.parentSessionId && original.role === 'Coordinator'
                ? 'Coordinator'
                : original.coordinationRole || null,
          }
        : a;
    }),
  ];
  state.snapshot.coverage = 'partial';
  state.snapshot.lastEventAt = [state.snapshot.lastEventAt, added.lastEventAt]
    .filter(Boolean)
    .sort()
    .at(-1);
  state.snapshot.revision = key(state.snapshot.revision, added.revision);
  return state;
}

// 仅使用所选原生父链内唯一的完整派生路径；不按昵称、角色或工单标题猜身份。
export function reconcileNativeRuns(raw, snapshot, rootSessionId) {
  const agents = snapshot.agents || [];
  const byId = new Map(agents.map((a) => [a.nativeAgentId, a]));
  const belongs = (agent) => {
    const seen = new Set();
    while (agent && !seen.has(agent.nativeAgentId)) {
      if (agent.nativeAgentId === rootSessionId) return true;
      seen.add(agent.nativeAgentId);
      agent = byId.get(agent.parentSessionId);
    }
    return false;
  };
  const teams = new Set(
    (raw.teams || []).filter((t) => sessionId(t) === rootSessionId).map((t) => t.teamId),
  );
  const root = byId.get(rootSessionId);
  const runs = (raw.runs || []).map((run) => {
    if (run.provider !== 'codex' || !teams.has(run.teamId)) return run;
    if (run.nativeAgentId) return { ...run };
    const name = run.agentName;
    // /root 指的是 team.rootSessionId；必须已观察到该真实主会话，不能从协调者角色猜 UUID。
    if (
      name === '/root' &&
      root &&
      !root.parentSessionId &&
      raw.teams.some((t) => t.teamId === run.teamId && t.rootSessionId === rootSessionId)
    )
      return {
        ...run,
        nativeAgentId: rootSessionId,
        identitySource: 'team-sync/root-session/matched-observed-agent',
      };
    if (!name?.startsWith('/root/') || name.endsWith('/')) return run;
    const candidates = agents.filter(
      (a) =>
        a.agentName === name &&
        ['codex-host/sqlite', 'codex-host/spawn-agent'].includes(a.agentNameSource) &&
        belongs(a),
    );
    const peers = raw.runs.filter(
      (r) => teams.has(r.teamId) && r.provider === 'codex' && r.agentName === name,
    );
    // 允许同一真实实例的历史执行 + 唯一活动执行；同时活动的同名 run 仍需显式 UUID。
    if (
      candidates.length !== 1 ||
      peers.some((r) => r.nativeAgentId && r.nativeAgentId !== candidates[0].nativeAgentId) ||
      peers.filter((r) => ['running', 'queued'].includes(r.status)).length > 1
    )
      return run;
    return {
      ...run,
      nativeAgentId: candidates[0].nativeAgentId,
      identitySource: 'codex-host/unique-agent-path',
    };
  });
  for (const run of runs) {
    if (run.provider !== 'codex' || !teams.has(run.teamId) || !run.nativeAgentId) continue;
    const agent = byId.get(run.nativeAgentId);
    if (!agent || !belongs(agent)) continue;
    const latestRun = latest(
      runs.filter(
        (r) =>
          r.provider === 'codex' && teams.has(r.teamId) && r.nativeAgentId === run.nativeAgentId,
      ),
    ).at(-1);
    if (latestRun !== run) continue;
    // 已结束 run 的后续原生回合可能是新任务，不能把新活动写回旧工单。
    if (!['running', 'queued'].includes(run.status)) continue;
    const taskExecution = latest(
      (snapshot.tasks || []).filter(
        (t) => t.nativeAgentId === run.nativeAgentId && t.source === 'codex-host/native-turn',
      ),
    ).at(-1);
    const execution = agent.nativeExecution
      ? {
          executionStatus: agent.nativeExecution.status,
          observedAt: agent.nativeExecution.at,
          activityAt: agent.nativeExecution.activityAt || agent.nativeExecution.at,
          activitySummary: agent.nativeExecution.activitySummary,
          source: 'codex-host/native-turn',
        }
      : taskExecution;
    if (!execution) continue;
    if (Date.parse(execution.observedAt) >= Date.parse(run.statusUpdatedAt || at(run))) {
      run.status = execution.executionStatus;
      run.executionSource = execution.source;
      run.executionObservedAt = execution.observedAt;
    }
    if (
      execution.activitySummary &&
      Date.parse(execution.activityAt) > Date.parse(run.activitySummaryAt || at(run))
    ) {
      run.activitySummary = execution.activitySummary;
      run.activitySummaryAt = execution.activityAt;
      run.activitySource = execution.activitySource || execution.source;
    }
  }
  return { ...raw, runs };
}
