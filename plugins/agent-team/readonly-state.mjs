import {activityTime,recentFirst} from './web/selector-order.mjs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { remoteWorkspaces } from './workspace-registry.mjs';
import { readSnapshot, samePath } from './native-state.mjs';

export async function readState({ projectId, rootSessionId, root, directory, registryPath } = {}) {
  const statePath = registryPath || resolve(process.env.CODEX_HOME || resolve(homedir(), '.codex'), '.codex-global-state.json');
  let registry, workspaceWarning = null;
  try { registry = JSON.parse(await readFile(statePath, 'utf8')); }
  catch { registry = {}; workspaceWarning = '宿主已保存项目清单不可用；仅显示当前工程。'; }
  const local = Object.values(registry['local-projects'] || {}).flatMap(p => {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.rootPaths) || typeof p.rootPaths[0] !== 'string') return [];
    return [{ id: JSON.stringify(['local',p.id]), projectId:p.id, hostId:'local', hostName:'本机',
      kind:'local', name:p.name || p.rootPaths[0], path:p.rootPaths[0],updatedAt:Number.isFinite(activityTime(p.updatedAt))?new Date(activityTime(p.updatedAt)).toISOString():null,
      source:'宿主已保存本机项目（兼容适配）', connectionStatus:'unknown' }];
  });
  const projects = [...local, ...remoteWorkspaces(registry)];
  if (!projects.some(p=>p.hostId==='local' && samePath(p.path,root))) projects.unshift({
    id:JSON.stringify(['local',root]), projectId:null, hostId:'local', hostName:'本机', kind:'local',
    name:'codex-agent-team-plugin', path:root, source:'当前工程路径', connectionStatus:'unknown' });
  const selected = projectId
    ? projects.find(p=>p.id===projectId || (p.hostId==='local' && p.projectId===projectId))
    : projects.find(p=>p.hostId==='local' && samePath(p.path,root));
  if (!selected) throw new Error('Workspace 已移除或不可用');
  const observed=await readSnapshot(directory,selected,{rootSessionId,workspaces:projects});
  const snapshot = selected.kind === 'remote'
    ? { coverage:'unavailable', tasks:[], agents:[], unassociated:[], lastEventAt:null,
      capturedAt:new Date().toISOString(), revision:null,workspaceActivityAt:observed.workspaceActivityAt, note:'SSH 实时执行展示尚未接入。' }
    : observed;
  const sessions=snapshot.sessions||[];
  for(const project of projects){
    const times=[activityTime(project.updatedAt),activityTime(snapshot.workspaceActivityAt?.[project.id])].filter(Number.isFinite);
    project.lastActivityAt=times.length?new Date(Math.max(...times)).toISOString():null;
  }
  delete snapshot.workspaceActivityAt;
  delete snapshot.sessions;
  if(!rootSessionId&&selected.kind!=='remote') {
    snapshot.tasks=[];snapshot.agents=[];snapshot.unassociated=[];
    snapshot.coverage='session-required';snapshot.lastEventAt=null;snapshot.revision=null;
  }
  return { schemaVersion:1, source:'原生生命周期/宿主观察 + 协调者任务回报',
    projects:recentFirst(projects), sessions, selectedProjectId:selected.id, selectedRootSessionId:rootSessionId||null,
    scope:'session', workspaceWarning, snapshotAt:new Date().toISOString(),
    snapshot, readOnly:true };
}

