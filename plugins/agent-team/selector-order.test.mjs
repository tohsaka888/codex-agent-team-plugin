import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ingest} from './native-state.mjs';
import {readState} from './readonly-state.mjs';
import {recentFirst,sessionOptions} from './web/selector-order.mjs';

test('菜单按时间倒序，仅显示有可读标题的会话，保留原始数据',()=>{
 const id='01a0fc3f-b6e9-7050-8ae7-ac74a072fa41';
 const input=[{id,title:id,lastActivityAt:'2026-10-01T00:00:00Z'},{id:'new',title:'新任务',lastActivityAt:'2026-10-02T00:00:00Z'},{id:'missing',title:'',lastActivityAt:null},{id:'invalid',title:'',lastActivityAt:'bad'}];
 const result=sessionOptions(input);assert.deepEqual(result.map(s=>s.id),['new']);
 assert.equal(result[0].displayTitle,'新任务');assert.equal(input.length,4);assert.equal(input[0].title,id);
 assert.deepEqual(recentFirst([{id:'unknown'},{id:'old',updatedAt:1000},{id:'new',updatedAt:2000}]).map(p=>p.id),['new','old','unknown']);
});
test('公开快照使用子Agent活动排序主会话，Workspace取已知活动和宿主更新时间，查询不改变范围',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'selector-order-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'project'),other=join(dir,'other');const registryPath=join(dir,'registry.json');
 await writeFile(registryPath,JSON.stringify({'remote-projects':[{id:'r',hostId:'ssh',remotePath:'/project'}],'local-projects':{a:{id:'a',name:'当前项目',rootPaths:[root],updatedAt:Date.parse('2026-10-01T00:00:00Z')},b:{id:'b',name:'更新项目',rootPaths:[other],updatedAt:Date.parse('2026-10-04T00:00:00Z')}}}));
 for(const [sessionId,observedAt] of [['older','2026-10-01T00:00:00Z'],['newer','2026-10-02T00:00:00Z']])await ingest(dir,{kind:'host-observation',cwd:root,sessionId,observedAt,source:'codex-app/list_threads'});
 await ingest(dir,{kind:'hook',hook_event_name:'SubagentStart',cwd:root,session_id:'older',agent_id:'child',observedAt:'2026-10-03T00:00:00Z'});
 const state=await readState({root,directory:dir,registryPath,rootSessionId:'newer'});
 assert.deepEqual(state.sessions.map(s=>s.id),['older','newer']);assert.equal(state.sessions[0].lastActivityAt,'2026-10-03T00:00:00.000Z');
 assert.deepEqual(state.projects.map(p=>p.projectId),['b','a','r']);assert.equal(state.projects[1].lastActivityAt,'2026-10-03T00:00:00.000Z');
 const remote=await readState({root,directory:dir,registryPath,projectId:JSON.stringify(['ssh','r'])});
 assert.deepEqual(remote.projects.map(p=>[p.id,p.lastActivityAt]),state.projects.map(p=>[p.id,p.lastActivityAt]));assert.equal(remote.snapshot.coverage,'unavailable');assert.deepEqual(remote.snapshot.tasks,[]);
 assert.equal(state.selectedProjectId,JSON.stringify(['local','a']));assert.equal(state.selectedRootSessionId,'newer');assert.ok(state.snapshot.agents.every(a=>a.nativeAgentId==='newer'));
});


test('旧插件实际列表缺时间时，从只读范围查询补最近活动，最新在顶且缓存不改变选择',async()=>{
 const {createSelectorActivityReader}=await import('./web/selector-order.mjs');
 const {readFile}=await import('node:fs/promises');
 const legacy=JSON.parse(await readFile(new URL('./fixtures/selector-legacy.json',import.meta.url),'utf8'));
 const dates=['2026-09-30T00:00:00Z','2026-10-01T00:00:00Z','2026-10-02T09:00:00Z','2026-10-02T12:00:00Z','2026-10-02T11:00:00Z'];
 const calls=[];
 const enrich=createSelectorActivityReader(async(projectId,rootSessionId)=>{
  calls.push([projectId,rootSessionId]);
  return {selectedProjectId:projectId,selectedRootSessionId:rootSessionId||null,sessions:projectId===legacy.selectedProjectId?legacy.sessions:[],snapshot:{lastEventAt:dates[legacy.sessions.findIndex(s=>s.id===rootSessionId)]||null}};
 });
 const enriched=await enrich({...legacy,snapshot:{lastEventAt:dates[3]}});
 assert.deepEqual(sessionOptions(enriched.sessions).map(s=>s.title),['优化 Agent Team 整体 UI 与彩色动态图标','修复团队视图五项验收反馈','查看一条真实本机原生 Task']);
 assert.equal(recentFirst(enriched.projects)[0].id,legacy.selectedProjectId);assert.equal(enriched.selectedRootSessionId,legacy.selectedRootSessionId);
 const count=calls.length;await enrich(legacy);assert.equal(calls.length,count);assert.ok(!Object.hasOwn(legacy.sessions[0],'lastActivityAt'));
 const modern={...enriched,sessions:enriched.sessions.map(s=>({...s,lastActivityAt:s.lastActivityAt||null}))};await enrich(modern);assert.equal(calls.length,count);
});


test('单条旧会话查询失败仍保留当前快照真实时间和项目排序',async()=>{
 const {createSelectorActivityReader}=await import('./web/selector-order.mjs');
 const state={selectedProjectId:'p',selectedRootSessionId:'current',projects:[{id:'p',kind:'local'}],sessions:[{id:'old',title:'旧会话'},{id:'current',title:'当前会话'}],snapshot:{lastEventAt:'2026-10-04T00:00:00Z'}};
 const enrich=createSelectorActivityReader(async()=>{throw Error('临时断线');});
 const result=await enrich(state);
 assert.deepEqual(sessionOptions(result.sessions).map(s=>s.id),['current','old']);assert.equal(result.projects[0].lastActivityAt,'2026-10-04T00:00:00.000Z');assert.equal(result.selectorActivityUnavailable,true);
});
