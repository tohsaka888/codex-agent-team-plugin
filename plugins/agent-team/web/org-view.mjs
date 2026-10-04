// 只读执行层级：未知父关系和循环独立呈现，不补造连线。
export const agentId = (agent) => agent.agentId || agent.nativeAgentId;
export const orgId = (agent) => agent.orgNodeId || agentId(agent);
const parentId = (agent) => (agent.orgNodeId ? agent.parentOrgNodeId : agent.parentAgentId);
export function orgForest(agents = []) {
  const byId = new Map(agents.map((a) => [orgId(a), a]));
  const children = new Map(),
    roots = [],
    unlinked = [];
  for (const agent of byId.values()) {
    const parent = parentId(agent);
    let cursor = agent,
      seen = new Set([orgId(agent)]),
      cyclic = false;
    while (parentId(cursor) && byId.has(parentId(cursor))) {
      if (seen.has(parentId(cursor))) {
        cyclic = true;
        break;
      }
      seen.add(parentId(cursor));
      cursor = byId.get(parentId(cursor));
    }
    if (cyclic || (parent && !byId.has(parent)) || (!parent && agent.parentSessionId)) {
      unlinked.push(agent);
      continue;
    }
    if (!parent) roots.push(agent);
    else {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(agent);
    }
  }
  // 孤立分支的已知子节点仍展示，不能因根缺失而静默消失。
  const build = (agent, seen = new Set()) => {
    if (seen.has(orgId(agent))) return { ...agent, children: [] };
    const next = new Set(seen).add(orgId(agent));
    return { ...agent, children: (children.get(orgId(agent)) || []).map((a) => build(a, next)) };
  };
  return { roots: roots.map((a) => build(a)), unlinked: unlinked.map((a) => build(a)) };
}

const stamp = (value) => (Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0);
const latest = (a, b) =>
  stamp(b.observedAt) - stamp(a.observedAt) ||
  String(a.id || a.nativeAgentId).localeCompare(String(b.id || b.nativeAgentId));
const roles = {
  coordinator: 'Coordinator',
  architect: 'Architect',
  requirements: 'Requirements',
  developer: 'Developer',
  reviewer: 'Reviewer',
  ue: 'UE',
};
// 职责投影保留真实实例；展示节点 ID 不冒充原生 UUID。
export function orgRoleView(agents = [], tasks = []) {
  const forest = orgForest(agents),
    verifiedParents = new Map(),
    uncertain = new Set(forest.unlinked.map(orgId));
  function walk(node) {
    for (const child of node.children) {
      verifiedParents.set(agentId(child), agentId(node));
      walk(child);
    }
  }
  [...forest.roots, ...forest.unlinked].forEach(walk);
  const groups = new Map(),
    membership = new Map(),
    unknownRoles = new Set(['', 'unknown', '未知', '角色未知', '未提供', 'unavailable']);
  function visit(agent, parentPath) {
    const role = String(agent.role || '').trim(),
      key = role.toLowerCase();
    const path =
      parentPath && !unknownRoles.has(key) && !uncertain.has(agentId(agent))
        ? [...parentPath, ['role', key]]
        : [['instance', agentId(agent)]];
    const id = JSON.stringify(path);
    if (!groups.has(id))
      groups.set(id, {
        orgNodeId: id,
        role:
          roles[key] ||
          (unknownRoles.has(key)
            ? roles[agent.nativeRole?.toLowerCase()] ||
              agent.nativeRole ||
              agent.agentName?.split('/').at(-1) ||
              '角色未知'
            : role),
        members: [],
      });
    const { children, ...instance } = agent;
    groups.get(id).members.push(instance);
    membership.set(agentId(agent), id);
    for (const child of children) visit(child, path);
  }
  [...forest.roots, ...forest.unlinked].forEach((a) => visit(a, null));
  return [...groups.values()].map((group) => {
    const ids = new Set(group.members.map(agentId));
    const linked = tasks
      .flatMap((t) => {
        const matches = t.runs?.filter((r) => ids.has(r.agentId));
        if (matches?.length) {
          const recent = [...matches].sort(latest)[0];
          return [
            {
              ...t,
              ...recent,
              id: t.id,
              runs: t.runs,
              title: t.title,
              businessStatus: t.businessStatus,
              reviewPhase: t.reviewPhase,
              acceptanceItems: t.acceptanceItems,
              reviewRecords: t.reviewRecords,
              reviewRequirements: t.reviewRequirements,
              artifacts: t.artifacts,
              skills: t.skills,
            },
          ];
        }
        return !t.runs && ids.has(t.agentId || t.nativeAgentId) ? [t] : [];
      })
      .sort(latest);
    const recentTask = linked[0] || null;
    const representative =
      group.members.find(
        (a) => agentId(a) === (recentTask?.agentId || recentTask?.nativeAgentId),
      ) || [...group.members].sort(latest)[0];
    const actualParent = representative.parentAgentId;
    return {
      ...representative,
      ...group,
      nativeAgentId: representative.nativeAgentId,
      parentOrgNodeId: actualParent
        ? membership.get(actualParent) || 'missing:' + actualParent
        : null,
      nativeAgentIds: [...ids],
      recentTask,
      historyTasks: linked.slice(1),
      currentTaskId: recentTask?.id || null,
      activeCount: group.members.filter(
        (a) => a.lifecycle === 'active' || a.executionStatus === 'running',
      ).length,
      activitySummary: recentTask?.activitySummary || representative.activitySummary,
      relationEvidence: group.members
        .filter((a) => verifiedParents.has(agentId(a)))
        .map((a) => ({ from: verifiedParents.get(agentId(a)), to: agentId(a) })),
    };
  });
}
