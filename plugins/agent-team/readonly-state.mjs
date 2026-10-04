import { activityTime, recentFirst } from './web/selector-order.mjs';
import { readFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import { remoteWorkspaces } from './workspace-registry.mjs';
import { readHostCatalog } from './host-catalog.mjs';
import { hydrateActivity, readActivity } from './host-activity.mjs';
import { readSnapshot, samePath } from './native-state.mjs';
import { readPortableState, mergePortable } from './portable-state.mjs';

export async function readState({
  projectId,
  rootSessionId,
  root,
  directory,
  registryPath,
  codexHome,
  autoSelectSession = false,
  currentSessionId,
  portable = false,
  dataDir,
} = {}) {
  if (portable) return readPortableState({ root, dataDir, projectId, rootSessionId });
  const statePath =
    registryPath ||
    resolve(process.env.CODEX_HOME || resolve(homedir(), '.codex'), '.codex-global-state.json');
  let registry,
    workspaceWarning = null;
  try {
    registry = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    registry = {};
    workspaceWarning = '宿主已保存项目清单不可用；仅显示当前工程。';
  }
  const local = Object.values(registry['local-projects'] || {}).flatMap((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !Array.isArray(p.rootPaths) ||
      typeof p.rootPaths[0] !== 'string'
    )
      return [];
    return [
      {
        id: JSON.stringify(['local', p.id]),
        projectId: p.id,
        hostId: 'local',
        hostName: '本机',
        kind: 'local',
        name: p.name || p.rootPaths[0],
        path: p.rootPaths[0],
        updatedAt: Number.isFinite(activityTime(p.updatedAt))
          ? new Date(activityTime(p.updatedAt)).toISOString()
          : null,
        source: '宿主已保存本机项目（兼容适配）',
        connectionStatus: 'unknown',
      },
    ];
  });
  const catalog =
    registryPath && !codexHome
      ? { projects: [], threads: [], warning: null }
      : await readHostCatalog(codexHome);
  const projects = [...local, ...remoteWorkspaces(registry)];
  for (const p of catalog.projects)
    if (!projects.some((x) => x.hostId === 'local' && samePath(x.path, p.path))) projects.push(p);
  if (catalog.projects.length) workspaceWarning = catalog.warning;
  else if (catalog.warning) workspaceWarning = catalog.warning;
  let current = catalog.threads.find((t) => t.id === currentSessionId),
    seen = new Set();
  while (current?.parentSessionId && !seen.has(current.id)) {
    seen.add(current.id);
    current = catalog.threads.find((t) => t.id === current.parentSessionId);
  }
  if (current?.parentSessionId) current = null;
  const bound =
    catalog.threads.find((t) => t.id === rootSessionId && !t.parentSessionId) ||
    (!rootSessionId && autoSelectSession ? current : null);
  const discoveredDefault = bound
    ? projects.find((p) => p.hostId === 'local' && samePath(p.path, bound.cwd))
    : !local.length
      ? recentFirst(
          projects.map((p) => ({
            ...p,
            lastActivityAt: catalog.threads
              .filter((t) => samePath(t.cwd, p.path))
              .map((t) => t.lastActivityAt)
              .sort()
              .at(-1),
          })),
        )[0]
      : null;
  if (!projects.some((p) => p.hostId === 'local' && samePath(p.path, root)))
    projects.unshift({
      id: JSON.stringify(['local', root]),
      projectId: null,
      hostId: 'local',
      hostName: '本机',
      kind: 'local',
      name: 'codex-agent-team-plugin',
      hostName:
        process.env.AGENT_TEAM_HOST_NAME || (process.platform === 'win32' ? '本机' : hostname()),
      path: root,
      source: '当前插件工程路径',
      connectionStatus: 'unknown',
    });
  let selected = projectId
    ? projects.find(
        (p) => p.id === projectId || (p.hostId === 'local' && p.projectId === projectId),
      )
    : discoveredDefault || projects.find((p) => p.hostId === 'local' && samePath(p.path, root));
  let projectSelectionSource = null;
  // 桌面 SSH 项目 UUID 不存在于服务器注册表。仅在打开时使用已核对的原生主会话 cwd 恢复。
  if (!selected && autoSelectSession && bound && discoveredDefault) {
    selected = discoveredDefault;
    projectSelectionSource = 'native-session';
    workspaceWarning = '调用方项目标识不在当前宿主清单；已按核对的原生主会话工作区打开。';
  }
  if (!selected) throw new Error('Workspace 已移除或不可用');
  let sessionSelectionSource = rootSessionId ? 'explicit' : null;
  if (!rootSessionId && autoSelectSession && selected.hostId === 'local') {
    if (current && samePath(current.cwd, selected.path)) {
      rootSessionId = current.id;
      sessionSelectionSource = 'invocation-environment';
    } else {
      const candidates = catalog.threads.filter(
        (t) => !t.parentSessionId && t.title && samePath(t.cwd, selected.path),
      );
      const home = codexHome || process.env.CODEX_HOME || resolve(homedir(), '.codex');
      const byId = new Map(catalog.threads.map((t) => [t.id, t])),
        candidateIds = new Set(candidates.map((t) => t.id)),
        members = new Map(candidates.map((t) => [t.id, []])),
        activities = new Map();
      for (const t of catalog.threads) {
        let ancestor = t;
        const visited = new Set();
        while (ancestor?.parentSessionId && !visited.has(ancestor.id)) {
          visited.add(ancestor.id);
          ancestor = byId.get(ancestor.parentSessionId);
        }
        if (ancestor && !ancestor.parentSessionId && candidateIds.has(ancestor.id)) {
          members.get(ancestor.id).push(t);
          activities.set(t.id, await readActivity(home, t));
        }
      }
      const active = candidates.filter((c) =>
        members.get(c.id).some((t) => activities.get(t.id)?.latest?.status === 'running'),
      );
      const chosen = recentFirst(
        (active.length ? active : candidates).map((c) => ({
          ...c,
          lastActivityAt:
            members
              .get(c.id)
              .map((t) => t.lastActivityAt)
              .filter(Boolean)
              .sort()
              .at(-1) || c.lastActivityAt,
        })),
      )[0];
      if (chosen) {
        rootSessionId = chosen.id;
        sessionSelectionSource = active.length ? 'recent-active' : 'recent-session';
      }
    }
  }
  const nativeThreads =
    selected.hostId === 'local'
      ? await hydrateActivity(
          codexHome || process.env.CODEX_HOME || resolve(homedir(), '.codex'),
          catalog.threads,
          selected,
          rootSessionId,
        )
      : [];
  const observed = await readSnapshot(directory, selected, {
    rootSessionId,
    workspaces: projects,
    nativeThreads,
  });
  const snapshot =
    selected.kind === 'remote' && observed.coverage === 'unobserved'
      ? {
          coverage: 'unavailable',
          tasks: [],
          agents: [],
          unassociated: [],
          lastEventAt: null,
          capturedAt: new Date().toISOString(),
          revision: null,
          workspaceActivityAt: observed.workspaceActivityAt,
          note: 'SSH 实时执行展示尚未接入。',
        }
      : observed;
  const sessions = snapshot.sessions || [];
  for (const project of projects) {
    const times = [
      activityTime(project.updatedAt),
      activityTime(snapshot.workspaceActivityAt?.[project.id]),
    ].filter(Number.isFinite);
    project.lastActivityAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
  }
  delete snapshot.workspaceActivityAt;
  delete snapshot.sessions;
  if (!rootSessionId && snapshot.coverage !== 'unavailable') {
    snapshot.tasks = [];
    snapshot.agents = [];
    snapshot.unassociated = [];
    snapshot.coverage = 'session-required';
    snapshot.lastEventAt = null;
    snapshot.revision = null;
  }
  return mergePortable(
    {
      schemaVersion: 1,
      source: '原生生命周期/宿主观察 + 协调者任务回报',
      projects: recentFirst(projects),
      sessions,
      selectedProjectId: selected.id,
      selectedRootSessionId: rootSessionId || null,
      scope: 'session',
      sessionSelectionSource,
      projectSelectionSource,
      workspaceWarning,
      snapshotAt: new Date().toISOString(),
      snapshot,
      readOnly: true,
    },
    { dataDir },
  );
}
