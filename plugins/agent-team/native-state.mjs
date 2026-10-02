import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, win32, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acceptanceItems,reviewRecords } from './traceability.mjs';
import {reviewRequirements,humanReview} from './human-review.mjs';

export function samePath(a, b, hostId = 'local') {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const style = hostId === 'local' && process.platform === 'win32' ? win32 : posix;
  const clean = x => style.normalize(x).replace(/[\\/]$/, '');
  return hostId === 'local' ? clean(a).toLowerCase() === clean(b).toLowerCase() : clean(a) === clean(b);
}
const text = (x, max = 500) => typeof x === 'string' && x.length > 0 && x.length <= max ? x : null;
const statuses = new Set(['queued','running','completed','failed','interrupted','blocked','unknown']);
const reviews = new Set(['awaiting_review','repair_required','passed','unknown']);
const skills = values => (Array.isArray(values)?values:[]).slice(0,20).flatMap(value=>
  text(value?.name) && ['reported-use','observed-read'].includes(value?.usage) && text(value?.evidence,2000)
    ? [{name:value.name,usage:value.usage,evidence:value.evidence}] : []);
const artifacts = values => (Array.isArray(values)?values:[]).slice(0,20).flatMap(value=>
  text(value?.title) && text(value?.reference,2048)
    ? [{title:value.title,kind:text(value.kind)||'report',reference:value.reference,
      summary:text(value.summary,2000),availability:['available','unavailable'].includes(value.availability)?value.availability:'unknown'}] : []);
export async function ingest(directory, input) {
  if (!input || !text(input.cwd, 2048)) throw new Error('缺少工作区路径');
  const hostId = text(input.hostId) || 'local';
  const observedAt = text(input.observedAt) || new Date().toISOString();
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('时间无效');
  let event;
  if (input.kind === 'host-observation') {
    if (input.source !== 'codex-app/list_threads' || !text(input.sessionId)) throw new Error('原生观察缺少标识或来源');
    event = { kind: input.kind, hostId, cwd: input.cwd, sessionId: input.sessionId,
      lifecycle: ['active','idle','notLoaded'].includes(input.lifecycle) ? input.lifecycle : 'unknown', source: input.source };
  } else if (input.kind === 'task-report') {
    if (!text(input.sessionId) || !text(input.taskId) || !text(input.title)) throw new Error('任务回报缺少关联标识');
    event = { kind: input.kind, hostId, cwd: input.cwd, sessionId: input.sessionId,
      taskId: input.taskId, nativeAgentId: text(input.nativeAgentId) || input.sessionId, title: input.title,
      goal: text(input.goal, 4000), role: text(input.role), acceptance: text(input.acceptance, 4000),
      agentName:text(input.agentName),agentNameSource:text(input.agentName)?'native-coordinator/task-name':null,
      activitySummary: text(input.activitySummary, 2000),
      skills:skills(input.skills),artifacts:artifacts(input.artifacts),
      executionStatus: statuses.has(input.executionStatus) ? input.executionStatus : 'unknown',
      reviewPhase: reviews.has(input.reviewPhase) ? input.reviewPhase : 'unknown',
      source: 'native-coordinator/task-report' };
    if(Array.isArray(input.acceptanceItems)){event.acceptanceItems=acceptanceItems(input.acceptanceItems);event.acceptanceItemsReported=true;}
    if(Array.isArray(input.reviewRecords))event.reviewRecords=reviewRecords(input.reviewRecords);
    if(Array.isArray(input.reviewRequirements))event.reviewRequirements=reviewRequirements(input.reviewRequirements);
    if(!Object.hasOwn(input,'acceptance'))delete event.acceptance;
  } else if (input.kind === 'hook' || input.hook_event_name) {
    const name = input.hook_event_name;
    if (!['SessionStart','SubagentStart','SubagentStop','Stop','Interrupt'].includes(name) || !text(input.session_id)) throw new Error('不支持的原生事件');
    if (name.startsWith('Subagent') && !text(input.agent_id)) throw new Error('子 Agent 标识缺失');
    event = { kind: 'hook', hostId, cwd: input.cwd, sessionId: input.session_id, hook: name,
      nativeAgentId: text(input.agent_id), role: text(input.agent_type), turnId: text(input.turn_id),
      source: 'codex-hook/' + name };
  } else throw new Error('不支持的回报类型');
  // 只采集白名单元数据；不写 transcript、工具输入或完整提示。
  event.observedAt = new Date(observedAt).toISOString();
  event.receivedAt = new Date().toISOString();
  event.eventId = randomUUID();
  await mkdir(directory, { recursive: true });
  const tmp = join(directory, event.eventId + '.tmp');
  await writeFile(tmp, JSON.stringify(event), { flag: 'wx' });
  await rename(tmp, join(directory, event.eventId + '.json'));
  return event.eventId;
}
export async function readSnapshot(directory, workspace, { rootSessionId, workspaces=[] } = {}) {
  let files;
  try { files = (await readdir(directory)).filter(x => /^[a-f0-9-]{36}\.json$/.test(x)).sort(); }
  catch (error) { if (error.code === 'ENOENT') files = []; else throw error; }
  if (files.length > 10000) throw new Error('展示缓存过大，需要明确处理缓存范围');
  const events = [],workspaceActivityAt={};
  let invalid = 0;
  for (const file of files) {
    try {
      const value = JSON.parse(await readFile(join(directory, file), 'utf8'));
      if (!Number.isFinite(Date.parse(value.observedAt))) { invalid++; continue; }
      for(const project of workspaces)if(value.hostId===project.hostId&&samePath(value.cwd,project.path,project.hostId)&&(!workspaceActivityAt[project.id]||Date.parse(value.observedAt)>Date.parse(workspaceActivityAt[project.id])))workspaceActivityAt[project.id]=new Date(value.observedAt).toISOString();
      if (value.hostId === workspace.hostId && samePath(value.cwd, workspace.path, workspace.hostId)) events.push(value);
    } catch { invalid++; }
  }
  events.sort((a,b) => Date.parse(a.observedAt)-Date.parse(b.observedAt) || Date.parse(a.receivedAt)-Date.parse(b.receivedAt));
  const agents = new Map(), reports = new Map();
  const sessionIds = new Set();
  for (const event of events) {
    if (event.kind === 'host-observation' || (event.kind === 'hook' && event.hook === 'SessionStart')) {
      sessionIds.add(event.sessionId);
      const old=agents.get(event.sessionId);
      agents.set(event.sessionId, { ...old,nativeAgentId: event.sessionId, parentSessionId: old?.parentSessionId||null,
        parentAgentId: old?.parentAgentId||null, role: old?.role||(old?.parentSessionId?null:'Coordinator'), lifecycle: event.lifecycle || 'unknown',
        source: event.source, observedAt: event.observedAt });
    }
    if (event.kind === 'hook' && ['Stop','Interrupt'].includes(event.hook)) {
      const old=agents.get(event.sessionId);
      agents.set(event.sessionId, { ...old,nativeAgentId: event.sessionId, parentSessionId:old?.parentSessionId||null,
        parentAgentId:old?.parentAgentId||null, role:old?.role||(old?.parentSessionId?null:'Coordinator'),
        lifecycle:event.hook === 'Stop' ? 'idle' : 'interrupted',
        source:event.source, observedAt:event.observedAt });
    }
    if (event.kind === 'hook' && event.nativeAgentId) {
      sessionIds.add(event.sessionId);
      const old = agents.get(event.nativeAgentId);
      // 停止只说明本次 Agent 生命周期结束，不能说明 Task 成功。
      agents.set(event.nativeAgentId, { nativeAgentId: event.nativeAgentId,
        parentSessionId: event.sessionId, parentAgentId: null, role: old?.role || null,
        nativeRole:event.role||old?.nativeRole||null,
        lifecycle: event.hook === 'SubagentStop' ? 'stopped' : 'active',
        turnId:event.turnId, source: event.source, observedAt: event.observedAt });
    }
    if (event.kind === 'task-report') {
      const key=event.sessionId+'\0'+event.taskId,previous=reports.get(key);
      const reviews=new Map((previous?.reviewRecords||[]).map(r=>[r.id,r]));
      for(const record of reviewRecords(event.reviewRecords))reviews.set(record.id,record);
      reports.set(key,{...event,
        reviewRequirements:reviewRequirements(event.reviewRequirements??previous?.reviewRequirements),
        acceptance:Object.hasOwn(event,'acceptance')?event.acceptance:previous?.acceptance??null,
        acceptanceItems:acceptanceItems(event.acceptanceItems??(event.acceptance&&event.acceptance!==previous?.acceptance?[]:previous?.acceptanceItems)),
        acceptanceItemsReported: event.acceptance&&event.acceptance!==previous?.acceptance&&!Object.hasOwn(event,'acceptanceItems')?false:Boolean(event.acceptanceItemsReported||previous?.acceptanceItemsReported),
        reviewRecords:[...reviews.values()].slice(-100)});
    }
  }
  const tasks = [], unassociated = [];
  function belongsTo(agentId,sessionId) {
    const visited=new Set();
    while(agentId&&!visited.has(agentId)){
      if(agentId===sessionId)return true;
      visited.add(agentId);agentId=agents.get(agentId)?.parentSessionId;
    }
    return false;
  }
  for (const report of reports.values()) {
    const identity = agents.get(report.nativeAgentId);
    if (!identity || !belongsTo(report.nativeAgentId,report.sessionId)) {
      unassociated.push({ sessionId:report.sessionId, taskId: report.taskId, reason: '缺少可核对的原生身份关联' }); continue;
    }
    tasks.push({ ...report,humanReview:humanReview(report), id: report.sessionId + ':' + report.taskId, workspaceId: workspace.id,
      identitySource: identity.source, nativeLifecycle: identity.lifecycle });
  }
  for (const agent of agents.values()) {
    // 仅当父会话标识与已观察的真实 Agent 标识匹配时解析，不创建占位父节点。
    if (agent.parentSessionId && agent.parentSessionId !== agent.nativeAgentId && agents.has(agent.parentSessionId)) {
      agent.parentAgentId = agent.parentSessionId;
      agent.parentSource = 'native-parent-session/matched-observed-agent';
    }
    const linked = tasks.filter(t=>t.nativeAgentId===agent.nativeAgentId)
      .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
    agent.taskIds = linked.map(t=>t.id);
    agent.currentTaskId = linked[0]?.id || null;
    agent.activitySummary = linked[0]?.activitySummary || null;
    agent.activityAt = linked[0]?.observedAt || agent.observedAt;
    agent.role = linked[0]?.role || agent.role;
    const named=linked.find(t=>t.agentName);
    agent.agentName=named?.agentName||null;agent.agentNameSource=named?.agentNameSource||null;
  }
  const sessions=[...agents.values()].filter(a=>!a.parentSessionId).map(a=>({id:a.nativeAgentId,
    title:tasks.find(t=>t.nativeAgentId===a.nativeAgentId)?.title||null,
    lastActivityAt:events.filter(e=>belongsTo(e.sessionId,a.nativeAgentId)||belongsTo(e.nativeAgentId,a.nativeAgentId)).at(-1)?.observedAt||null
  })).sort((a,b)=>Date.parse(b.lastActivityAt)-Date.parse(a.lastActivityAt));
  const included=new Set(rootSessionId ? (agents.has(rootSessionId)?[rootSessionId]:[]) : agents.keys());
  if(rootSessionId) {
    let changed=true;
    while(changed){changed=false;for(const a of agents.values())if(included.has(a.parentSessionId)&&!included.has(a.nativeAgentId)){included.add(a.nativeAgentId);changed=true;}}
  }
  const scopedEvents=rootSessionId?events.filter(e=>included.has(e.sessionId)&&(!e.nativeAgentId||included.has(e.nativeAgentId))):events;
  return { coverage: scopedEvents.length ? 'partial' : 'unobserved',
    tasks:tasks.filter(t=>!rootSessionId||(included.has(t.nativeAgentId)&&included.has(t.sessionId))),
    agents:[...agents.values()].filter(a=>included.has(a.nativeAgentId)), sessions,workspaceActivityAt,
    unassociated:unassociated.filter(t=>!rootSessionId||included.has(t.sessionId)), invalidRecords: invalid,
    capturedAt: new Date().toISOString(), lastEventAt: scopedEvents.at(-1)?.observedAt || null,
    revision: createHash('sha256').update(scopedEvents.map(e=>e.eventId).join('|')).digest('hex').slice(0,16),
    note: '仅展示已接入回报；原生生命周期与任务阶段分别记录，不保证历史完整。' };
}
