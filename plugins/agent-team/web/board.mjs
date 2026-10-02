import {recentFirst,sessionOptions,createSelectorActivityReader} from './selector-order.mjs';
import {roleIcon,roleClass} from './role-visual.mjs';
import {renderHumanReview,renderReviewBanner,reviewWait} from './human-review-view.mjs';
import { App, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { createOrgCanvas } from './org-canvas.mjs';
import { orgRoleView } from './org-view.mjs';
import { createMotion,changedTasks,captureCards,animateCards } from './motion.mjs';
import { visibleTasks,taskColumn } from './view-model.mjs';
import { createSnapshotReader } from './sync-query.mjs';
import {renderChecklist,renderReviews} from './trace-detail.mjs';
import {sessionUrl,canOpenNativeFile,openNativeFile} from './navigation.mjs';
const $=id=>document.getElementById(id);
const app=new App({name:'agent-team-readonly',version:'0.5.0'},{});
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,connected=false,mode='kanban',selectedTask,selectedAgent,selectedOrg,orgNodes=[],focusOrigin,requestedProject,requestedSession,projectList=[];
let timer,stopped=false,failureCount=0;
let search='',roleFilter='',ready=window.parent===window;
let receivedToolInput=false,userNavigated=false;
let decorativeRestoreFrame;
const motion=createMotion(),canvasViews=new Map();
const decorativePreference=matchMedia('(prefers-reduced-motion: reduce)');
function updateDecorativeMotion(){document.body.dataset.decorativeMotion=document.hidden||stopped||failureCount||decorativePreference.matches?'paused':'running';}
decorativePreference.addEventListener('change',updateDecorativeMotion);
updateDecorativeMotion();
let orgCanvas=null;
let artifactRequest=0,navigationRequest=0,artifactOrigin;
const artifactLink=(task,reference,label=reference)=>task&&reference?'<a class="trace-link" href="#artifact" data-artifact-task="'+safe(task.id)+'" data-artifact-reference="'+safe(reference)+'">'+safe(label)+' <span aria-hidden="true">↗</span></a>':safe(label);
async function showArtifact(taskId,reference) {
  const token=++artifactRequest,dialog=$('artifact-dialog');
  artifactOrigin={taskId,reference,scope:JSON.stringify([data.selectedProjectId,data.selectedRootSessionId])};
  $('artifact-title').textContent='产物预览';$('artifact-path').textContent=reference;$('artifact-content').textContent='正在读取已关联文件…';$('artifact-notice').textContent='只读文件预览';
  if(!dialog.open)dialog.showModal();
  try {
    const params={projectId:data.selectedProjectId,rootSessionId:data.selectedRootSessionId,taskId,reference};
    let result;
    if(connected) {
      const response=await app.callServerTool({name:'get_agent_team_artifact',arguments:params},{timeout:10000});
      if(response.isError)throw new Error(response.content?.find(c=>c.type==='text')?.text||'文件预览不可用');
      result=response.structuredContent;
    } else {
      const url=new URL('/api/artifact',location.href);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
      const response=await fetch(url,{signal:AbortSignal.timeout(10000)});const value=await response.json();
      if(!response.ok)throw new Error(value.error||'文件预览不可用');result=value;
    }
    if(token!==artifactRequest||!dialog.open)return;
    if(connected&&canOpenNativeFile(app)){
      await openNativeFile(app,result.path);
      if(token===artifactRequest&&dialog.open)dialog.close();
      return;
    }
    $('artifact-title').textContent=result.title||'产物预览';$('artifact-path').textContent=result.path;
    $('artifact-content').textContent=result.binary?'此文件无法以文本预览，请使用完整路径在 Codex 中打开。':result.content;
    $('artifact-notice').textContent='只读预览 · '+result.size+' 字节'+(result.truncated?' · 文件较大，仅展示前 120 KB':'')+' · 当前宿主未声明原生文件标签页能力';
    $('artifact-content').scrollTop=0;
  } catch(error){if(token===artifactRequest&&dialog.open)$('artifact-content').textContent='无法查看文件：'+error.message;}
}
function releaseCanvas(){if(orgCanvas){orgCanvas.destroy();orgCanvas=null;}}
const labels={queued:'待开始',running:'进行中',completed:'执行完成',failed:'失败',interrupted:'已中断',blocked:'阻塞',unknown:'未知'};
const lifeLabels={active:'活动中',idle:'空闲',stopped:'已结束',interrupted:'已中断',notLoaded:'未加载',unknown:'未知'};
const time=value=>value?new Date(value).toLocaleString():'未知';
function host(value) {
  if(value?.styles?.variables)applyHostStyleVariables(value.styles.variables);
  if(value?.styles?.css?.fonts)applyHostFonts(value.styles.css.fonts);
  if(value?.theme)document.documentElement.style.colorScheme=value.theme;
  const height=value?.containerDimensions?.height || value?.containerDimensions?.maxHeight;
  if(Number.isFinite(height)&&height>120)document.body.style.height='min(100dvh, '+height+'px)';
}
function column(task) {
  return taskColumn(task);
}

function taskState(task){return task.reviewPhase==='repair_required'?'待修正 · '+(labels[task.executionStatus]||'未知'):column(task)==='review'?'待评审':labels[task.executionStatus]||'未知';}
function taskTone(task){return task.reviewPhase==='repair_required'||column(task)==='review'||task.executionStatus==='blocked'?'warning':task.executionStatus==='completed'?'success':'';}
function card(task) {
  return '<button class="card role-'+roleClass(task.role)+'" data-task="'+safe(task.id)+'" aria-pressed="'+(task.id===selectedTask)+'"><span class="card-meta"><span class="task-key">'+safe(task.taskId)+'</span><span class="role-badge" title="职责角色">'+roleIcon(task.role)+safe(task.role||'未知')+'</span></span><strong>'+safe(task.title)+'</strong><span class="card-activity">'+safe(task.activitySummary||task.goal||'当前活动未提供')+'</span>'+(reviewWait(task)?'<span class="review-wait">'+safe(reviewWait(task))+'</span>':'')+'<span class="card-bottom"><span class="chip '+taskTone(task)+'">'+safe(taskState(task))+'</span>'+(task.agentName?'<span class="run-name" title="'+safe(task.agentName)+' · '+safe(task.nativeAgentId)+'">'+safe(task.agentName)+'</span>':'')+'</span></button>';
}
const icon='<svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="17" y="5" width="14" height="10" rx="3"/><path d="M24 15v9M10 32v-8h28v8"/><rect x="3" y="32" width="14" height="10" rx="3"/><rect x="31" y="32" width="14" height="10" rx="3"/></svg>';
function empty(kind) {
  const texts={
    loading:['正在同步会话','正在读取团队活动，页面会在收到数据后自动更新。'],
    'session-required':['选择一个主会话','看板按主会话及其子 Agent 展示。通过 @Agent Team 启用时会绑定明确的会话标识，也可以从已观察会话中选择。'],
    unobserved:['尚未收到本会话的团队活动','在原生 Codex 对话中开展团队任务后，已接入的任务与 Agent 会显示在这里。当前状态不代表没有任务。'],
    unavailable:['远程活动尚未接入','此 SSH 项目已保存。当前阶段可查看项目清单，实时远程任务与 Agent 活动将在后续接入。'],
    noTasks:['还没有关联的任务','已观察到原生活动，任务标题和阶段仍等待明确回报。切换 Agent Org Chart 可以查看已观察的 Agent。'],
    noAgents:['还没有可展示的 Agent','任务回报与原生身份建立关联后，这里会显示真实执行层级。'],
    noMatches:['没有匹配的任务','请调整标题搜索或角色条件；筛选不会改变原生任务。'],
    error:['暂时无法同步','数据通道不可用，可以稍后刷新。原生 Codex 任务继续按自身流程执行。']
  };
  const [title,description]=texts[kind]||texts.unobserved;
  const workspace=kind==='loading'?null:projectList.find(p=>p.id===(requestedProject||data?.selectedProjectId));
  const stages=mode==='kanban'?'<div class="stage-guide" aria-label="任务阶段"><div>待开始</div><div>进行中</div><div>待评审</div><div>执行完成</div></div>':'';
  return '<div class="empty-wrap">'+stages+'<section class="empty-state">'+icon+'<h2>'+safe(title)+'</h2><p>'+safe(description)+'</p><button data-retry>刷新数据</button><details><summary>查看数据范围</summary><p class="muted">仅显示已接入的原生事件与明确任务回报，不自动补全历史，不从执行结束推断验收。</p></details>'+(workspace?'<div class="path muted">'+safe(workspace.hostName)+' · '+safe(workspace.path)+'</div>':'')+'</section><p class="empty-note">查看、筛选与刷新均不会启动或改变任务</p></div>';
}
function setPicker(open,focus=false) {
  $('workspace-menu').hidden=!open;$('workspace').setAttribute('aria-expanded',String(open));
  if(open&&focus)($('workspace-menu').querySelector('[aria-selected=true]')||$('workspace-menu').querySelector('.option'))?.focus();
}
function chooseWorkspace(id) {
  userNavigated=true;
  releaseCanvas();motion.cancel();
  requestedProject=id;requestedSession=undefined;selectedTask=selectedAgent=selectedOrg=undefined;
  setPicker(false);$('workspace').focus();
  const project=projectList.find(p=>p.id===id);
  $('workspace-value').textContent=project?project.name+' · '+project.hostName:'正在加载';
  data=undefined;failureCount=0;$('review-banner').hidden=true;
  $('detail').hidden=true;$('filters').hidden=true;$('content').innerHTML=empty('loading');reader.select(id).then(schedule);
}
function updatePicker() {
  const active=document.activeElement?.dataset?.workspace;
  const signature=JSON.stringify(recentFirst(data.projects).map(p=>[p.id,p.name,p.hostName,p.path]));
  if($('workspace-menu').dataset.signature!==signature) {
    $('workspace-menu').innerHTML=recentFirst(data.projects).map(p=>'<button class="option" role="option" aria-selected="'+(p.id===data.selectedProjectId)+'" data-workspace="'+safe(p.id)+'"><span>'+safe(p.name)+' · '+safe(p.hostName)+(p.kind==='remote'?' · SSH':'')+'</span><small>'+safe(p.path)+'</small></button>').join('');
    $('workspace-menu').dataset.signature=signature;
    if(active)$('workspace-menu').querySelector('[data-workspace="'+CSS.escape(active)+'"]')?.focus();
  }
  $('workspace-menu').querySelectorAll('.option').forEach(b=>{
    b.setAttribute('aria-selected',String(b.dataset.workspace===data.selectedProjectId));
    b.onclick=()=>chooseWorkspace(b.dataset.workspace);
  });
  const current=data.projects.find(p=>p.id===data.selectedProjectId);
  $('workspace-value').textContent=current?current.name+' · '+current.hostName+(current.kind==='remote'?' · SSH':''):'Workspace 不可用';
  $('workspace').title=current?.path||'';
}
function agentTask(agent) {
  if(agent.recentTask)return agent.recentTask;
  return data.snapshot.tasks.find(t=>t.id===agent.currentTaskId) ||
    data.snapshot.tasks.filter(t=>t.nativeAgentId===agent.nativeAgentId).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
}
function agentCard(agent) {
  const task=agentTask(agent);
  const state=task?taskState(task):(agent.activeCount?'活动实例 '+agent.activeCount:lifeLabels[agent.lifecycle]||'未知');
  return '<button class="agent-card role-'+roleClass(agent.role)+'" data-agent="'+safe(agent.nativeAgentId)+'" data-org-node="'+safe(agent.orgNodeId)+'" aria-pressed="'+(selectedOrg===agent.orgNodeId)+'"><span class="agent-heading"><span class="role-avatar">'+roleIcon(agent.role)+'</span><span class="agent-identity"><strong>'+safe(agent.role||'角色未知')+'</strong><span class="muted" title="'+safe(agent.nativeAgentId)+'">'+safe(task?.agentName||agent.agentName||'派生名称未报告')+'</span></span><span class="chip '+(task?taskTone(task):'')+'">'+safe(state)+'</span></span><span class="task"><span class="task-caption">最近任务</span><strong>'+safe(task?.title||'最近任务未提供')+'</strong></span><span class="agent-foot">'+safe(agent.members.length+' 个执行实例')+(agent.activeCount?' · '+agent.activeCount+' 个活动中':'')+'</span></button>';
}
function detail() {
  const scroll=$('detail').querySelector('.detail-scroll')?.scrollTop||0;
  const selection=selectedTask||selectedOrg||selectedAgent;
  const sameSelection=$('detail').dataset.selection===selection;
  const active=document.activeElement;
  const focus=sameSelection&&$('detail').contains(active)?{scroll:active.classList.contains('detail-scroll'),
    url:active.dataset.navigation,task:active.dataset.artifactTask,reference:active.dataset.artifactReference,reviewTask:active.dataset.reviewTask,
    close:active.id==='close',summary:active.tagName==='SUMMARY'?'.'+active.parentElement.className+' summary':null}:null;
  const wasOpen=sameSelection && $('detail').querySelector('.diagnostic')?.open;
  const historyOpen=sameSelection && $('detail').querySelector('.task-history')?.open;
  const instancesOpen=sameSelection && $('detail').querySelector('.instance-history')?.open;
  const reviewHistoryOpen=sameSelection && $('detail').querySelector('.review-history')?.open;
  const task=data?.snapshot.tasks.find(t=>t.id===selectedTask);
  const roleNode=orgNodes.find(a=>a.orgNodeId===selectedOrg);
  const agent=roleNode||data?.snapshot.agents.find(a=>a.nativeAgentId===selectedAgent);
  $('detail').hidden=!task&&!agent;
  if(!task&&!agent)return;
  const taskAgent=task?data.snapshot.agents.find(a=>a.nativeAgentId===task.nativeAgentId):null;
  const fields=task?[['目标',task.goal],['负责角色',task.role],['当前活动',task.activitySummary]]:
    [['最近任务',agentTask(agent)?.title],['当前活动',agent.activitySummary||agentTask(agent)?.activitySummary],['该实例原生生命周期',lifeLabels[agent.lifecycle]||'未知'],['最近活动',time(agent.activityAt||agentTask(agent)?.observedAt||agent.observedAt)]];
  const diagnostic=task?[['负责 Agent',task.nativeAgentId],['原生类型',taskAgent?.nativeRole],['名称来源',task.agentNameSource||taskAgent?.agentNameSource],['执行配置','未报告（模型、推理与权限配置）'],['原生标识来源',task.identitySource],['任务阶段来源',task.source],['回报时间',time(task.observedAt)]]:
    [['最近任务负责 Agent',agent.nativeAgentId],['父 Agent',agent.parentAgentId|| (agent.parentSessionId?'未知 / 关系未提供':'无已报告父级')],['原生类型',agent.nativeRole],['执行配置','未报告（模型、推理与权限配置）'],['标识来源',agent.source],['父级关联来源',agent.parentSource],['名称来源',agent.agentNameSource],['观察时间',time(agent.observedAt)]];
  const rows=values=>'<dl>'+values.map(([name,value])=>'<dt>'+safe(name)+'</dt><dd>'+safe(value||'未知 / 未提供')+'</dd>').join('')+'</dl>';
  const linkedTask=task||agentTask(agent);
  const workspace=projectList.find(p=>p.id===data.selectedProjectId);
  const executionLink=(id,label='查看详细执行记录')=>{
    const url=data.snapshot.agents.some(a=>a.nativeAgentId===id)?sessionUrl(id,workspace?.hostId):null;
    return url?'<a class="trace-link" href="#execution-record" data-navigation="'+safe(url)+'">'+safe(label)+' <span aria-hidden="true">↗</span></a>':'<span class="muted">执行记录不可用</span>';
  };
  const evidence='<section class="evidence"><h3>Skills 使用</h3>'+(linkedTask?.skills?.length?linkedTask.skills.map(s=>'<p><strong>'+safe(s.name)+'</strong> · '+(s.usage==='observed-read'?'读取证据':'已报告使用')+'<br><span class="muted">'+safe(s.evidence)+'</span></p>').join(''):'<p class="muted">未报告技能使用；安装不代表已使用</p>')+
    '<h3>产物与验证证据</h3>'+(linkedTask?.artifacts?.length?linkedTask.artifacts.map(a=>'<p><strong>'+safe(a.title)+'</strong> · '+safe(({available:'已核对存在',unavailable:'不可用',unknown:'可用性未知'})[a.availability]||'可用性未知')+'<br><span class="reference">'+(a.availability==='unavailable'?safe(a.reference):artifactLink(linkedTask,a.reference))+'</span><br><span class="muted">'+safe(a.summary||'未提供摘要')+'</span></p>').join(''):'<p class="muted">未报告产物证据</p>')+'</section>';
  const taskRow=t=>'<li><strong>'+safe(t.title)+'</strong><span class="muted">'+safe(labels[t.executionStatus]||'未知')+' · '+safe(time(t.observedAt))+'</span><span class="reference">Agent '+safe(t.nativeAgentId)+'</span><span class="muted">派生名 '+safe(t.agentName||'未报告')+'</span>'+executionLink(t.nativeAgentId,'查看任务执行会话')+'</li>';
  const otherTasks=roleNode?.historyTasks||[],openTasks=otherTasks.filter(t=>['queued','running','blocked','unknown'].includes(t.executionStatus)||t.reviewPhase==='awaiting_review'||t.reviewPhase==='repair_required'),history=otherTasks.filter(t=>!openTasks.includes(t));
  const roleHistory=roleNode?'<section class="role-runs evidence"><details class="instance-history"><summary>执行实例 · '+roleNode.members.length+'</summary><ul>'+roleNode.members.map(a=>'<li><strong>'+safe(a.agentName||'派生名称未报告')+'</strong><span class="muted">原生类型 '+safe(a.nativeRole||'未报告')+' · '+safe(lifeLabels[a.lifecycle]||'未知')+'</span><span class="reference">'+safe(a.nativeAgentId)+'</span></li>').join('')+'</ul></details>'+(openTasks.length?'<h3>其他未完成任务 · '+openTasks.length+'</h3><ul>'+openTasks.map(taskRow).join('')+'</ul>':'')+(history.length?'<details class="task-history"><summary>历史任务 · '+history.length+'</summary><ul>'+history.map(taskRow).join('')+'</ul></details>':'')+'</section>':'';
  $('detail').innerHTML='<div class="detail-head"><h2>'+safe(task?.title||agent.role||'Agent 详情')+'</h2><button id="close" aria-label="关闭详情">×</button></div><div class="detail-scroll" tabindex="0" aria-label="详情正文"><div class="detail-summary">'+(linkedTask?'<span class="task-key">'+safe(linkedTask.taskId)+'</span><span class="chip '+taskTone(linkedTask)+'">'+safe(taskState(linkedTask))+'</span>':'')+'<span class="detail-name">'+roleIcon(task?.role||agent?.role)+safe(task?.agentName||taskAgent?.agentName||agent?.agentName||'派生名称未报告')+'</span>'+executionLink(linkedTask?.nativeAgentId||agent?.nativeAgentId)+'</div><p class="navigation-error" role="status" hidden></p>'+renderHumanReview(linkedTask,{reference:(value,label)=>artifactLink(linkedTask,value,label),taskLink:id=>{const found=data.snapshot.tasks.find(t=>t.id===id||t.taskId===id);return found?'<button class="review-task-link" data-review-task="'+safe(found.id)+'">'+safe(found.taskId)+'</button>':safe(id)+'（未接入）';}})+rows(fields)+renderChecklist(linkedTask)+'<details class="review-history"><summary>确认依据与评审历史</summary>'+renderReviews(linkedTask,{link:executionLink,reference:value=>artifactLink(linkedTask,value)})+'</details>'+evidence+roleHistory+
    '<details class="diagnostic"><summary>数据来源与同步信息</summary>'+rows(diagnostic)+'</details><p class="muted detail-note">职责、派生名称及执行配置是不同概念；仅展示已接入记录。</p></div>';
  $('detail').dataset.selection=selection;
  $('detail').querySelector('.diagnostic').open=Boolean(wasOpen);
  $('detail').querySelector('.review-history').open=Boolean(reviewHistoryOpen);
  bindReviewTasks($('detail'));
  if($('detail').querySelector('.task-history'))$('detail').querySelector('.task-history').open=Boolean(historyOpen);
  if($('detail').querySelector('.instance-history'))$('detail').querySelector('.instance-history').open=Boolean(instancesOpen);
  $('detail').querySelector('.detail-scroll').scrollTop=sameSelection?scroll:0;$('close').onclick=closeDetail;
  $('detail').querySelectorAll('[data-navigation]').forEach(link=>link.onclick=async event=>{
    event.preventDefault();const token=++navigationRequest,scope=JSON.stringify([data.selectedProjectId,data.selectedRootSessionId]);
    $('navigation-notice').hidden=true;
    try {
      if(!connected||!canOpenNativeFile(app))throw new Error('当前环境不支持原生执行记录标签页');
      const nativeAgentId=link.dataset.navigation.split('/').pop();
      const sourceTask=data.snapshot.tasks.find(t=>t.nativeAgentId===nativeAgentId)||linkedTask;
      if(!sourceTask)throw new Error('执行实例缺少关联任务');
      const result=await app.callServerTool({name:'get_agent_team_artifact',arguments:{projectId:data.selectedProjectId,rootSessionId:data.selectedRootSessionId,taskId:sourceTask.id,reference:'execution://'+nativeAgentId}},{timeout:20000});
      if(result.isError)throw new Error(result.content?.find(c=>c.type==='text')?.text||'执行记录不可用');
      if(token!==navigationRequest||scope!==JSON.stringify([data?.selectedProjectId,data?.selectedRootSessionId]))return;
      await openNativeFile(app,result.structuredContent.path);
    } catch(error) {
      if(token!==navigationRequest||scope!==JSON.stringify([data?.selectedProjectId,data?.selectedRootSessionId]))return;
      $('navigation-notice').textContent='无法打开执行记录：'+error.message;$('navigation-notice').hidden=false;
    }
  });
  $('detail').querySelectorAll('[data-artifact-task]').forEach(link=>link.onclick=event=>{event.preventDefault();showArtifact(link.dataset.artifactTask,link.dataset.artifactReference);});
  if(focus&&!$('artifact-dialog').open) {
    const target=focus.scroll?$('detail').querySelector('.detail-scroll'):focus.close?$('close'):focus.summary?$('detail').querySelector(focus.summary):[...$('detail').querySelectorAll('[data-navigation],[data-artifact-task],[data-review-task]')].find(el=>focus.reviewTask?el.dataset.reviewTask===focus.reviewTask:focus.url?el.dataset.navigation===focus.url:focus.task&&el.dataset.artifactTask===focus.task&&el.dataset.artifactReference===focus.reference);
    (target?.getClientRects().length?target:$('close'))?.focus({preventScroll:true});
  }
}
function closeDetail() {
  orgCanvas?.close();
  selectedTask=selectedAgent=selectedOrg=undefined;detail();
  $('content').querySelectorAll('[aria-pressed]').forEach(b=>b.setAttribute('aria-pressed','false'));
  const target=focusOrigin?$('content').querySelector(focusOrigin):null;
  (target||$(mode))?.focus();
}
function bindReviewTasks(container){container.querySelectorAll('[data-review-task]').forEach(button=>button.onclick=()=>{
  if(!data?.snapshot.tasks.some(t=>t.id===button.dataset.reviewTask))return;
  if(mode!=='kanban')$('kanban').click();
  selectedTask=button.dataset.reviewTask;selectedAgent=selectedOrg=undefined;
  focusOrigin='[data-task="'+CSS.escape(selectedTask)+'"]';
  render();$('close')?.focus({preventScroll:true});
});}
function render({changes=[]}={}) {
  const oldCards=mode==='kanban'?captureCards($('content')):new Map();
  if(mode==='kanban')motion.cancel();
  const active=document.activeElement;
  const focusedSession=active?.dataset?.session;
  const bannerFocused=$('review-banner').contains(active)?active?.dataset?.reviewTask:null;
  const focused=active?.dataset?.task?'[data-task="'+CSS.escape(active.dataset.task)+'"]':active?.dataset?.orgNode?'[data-org-node="'+CSS.escape(active.dataset.orgNode)+'"]':active?.dataset?.agent?'[data-agent="'+CSS.escape(active.dataset.agent)+'"]':null;
  const closeFocused=active?.id==='close';
  const detailFocused=$('detail').contains(active)&&active?.matches('.detail-scroll,[data-navigation],[data-artifact-task],[data-review-task]')?{
    selection:$('detail').dataset.selection,scroll:active.classList.contains('detail-scroll'),
    url:active.dataset.navigation,task:active.dataset.artifactTask,reference:active.dataset.artifactReference,reviewTask:active.dataset.reviewTask}:null;
  const detailSummaryFocused=active?.tagName==='SUMMARY' && $('detail').contains(active)?'.'+active.parentElement.className+' summary':null;
  const contentSummaryFocused=active?.tagName==='SUMMARY' && $('content').contains(active);
  const contentDetailsOpen=$('content').querySelector('details')?.open;
  const scroll={top:$('content').scrollTop,left:$('content').scrollLeft};
  const scope=JSON.stringify([data.selectedProjectId,data.selectedRootSessionId]);
  const columnScroll=$('content').dataset.scope===scope?new Map([...$('content').querySelectorAll('[data-column]')].map(el=>[el.dataset.column,el.scrollTop])):new Map();
  $('content').dataset.scope=scope;
  const {snapshot}=data;updatePicker();
  const banner=renderReviewBanner(snapshot.tasks);$('review-banner').innerHTML=banner;$('review-banner').hidden=!banner;bindReviewTasks($('review-banner'));
  orgNodes=orgRoleView(snapshot.agents,snapshot.tasks);
  if(selectedOrg){const current=orgNodes.find(n=>n.orgNodeId===selectedOrg);selectedAgent=current?.nativeAgentId;}
  if(mode!=='org'||snapshot.coverage!=='partial'||!snapshot.agents.length)releaseCanvas();
  const sessions=sessionOptions(data.sessions||[]);
  const sessionSignature=JSON.stringify([sessions,data.selectedRootSessionId]);
  if($('session-options').dataset.signature!==sessionSignature){
    $('session-options').innerHTML=sessions.map(s=>'<button data-session="'+safe(s.id)+'" aria-pressed="'+(s.id===data.selectedRootSessionId)+'" title="'+safe(s.id)+'">'+safe(s.displayTitle)+'</button>').join('');
    $('session-options').dataset.signature=sessionSignature;
  }
  $('session-options').querySelectorAll('button').forEach(b=>b.onclick=()=>{userNavigated=true;$('session-label').parentElement.open=false;$('session-label').focus();bindScope(data.selectedProjectId,b.dataset.session);});
  const selectedSession=sessions.find(s=>s.id===data.selectedRootSessionId);
  $('session-label').textContent=selectedSession?'主会话 · '+selectedSession.displayTitle:'选择主会话';
  $('session-label').title=data.selectedRootSessionId||'选择一个主会话';
  $('filters').hidden=mode!=='kanban'||snapshot.coverage!=='partial'||!snapshot.tasks.length;
  const roles=[...new Set(snapshot.tasks.map(t=>t.role||'角色未知'))].sort();
  const signature=JSON.stringify(roles);
  if($('roles').dataset.signature!==signature){
    $('roles').innerHTML=['',...roles].map(role=>'<button data-role="'+safe(role)+'">'+safe(role||'全部角色')+'</button>').join('');
    $('roles').dataset.signature=signature;
  }
  $('roles').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.role===roleFilter));b.onclick=()=>{roleFilter=b.dataset.role;selectedTask=undefined;render();};});
  const filtered=visibleTasks(snapshot.tasks,search,roleFilter);
  $('coverage').textContent=({partial:'已接入部分数据',unobserved:'尚未收到活动',unavailable:'远程活动未接入','session-required':'等待选择会话'})[snapshot.coverage]||'数据状态未知';
  $('content').setAttribute('aria-label',mode==='kanban'?'任务看板':'Agent 执行层级');
  if(snapshot.coverage!=='partial')$('content').innerHTML=empty(snapshot.coverage);
  else if(mode==='org'){
    if(!snapshot.agents.length)$('content').innerHTML=empty('noAgents');
    else {
      if(!orgCanvas){const key=JSON.stringify([data.selectedProjectId,data.selectedRootSessionId]);orgCanvas=createOrgCanvas({container:$('content'),detail:$('detail'),card:agentCard,motion,initialView:canvasViews.get(key),onView:value=>canvasViews.set(key,value),onClose:closeDetail,onSelect:id=>{selectedTask=undefined;selectedOrg=id;selectedAgent=orgNodes.find(n=>n.orgNodeId===id)?.nativeAgentId;focusOrigin='[data-org-node="'+CSS.escape(id)+'"]';detail();}});}
      orgCanvas.update(orgNodes);
    }
  }
  else if(!snapshot.tasks.length)$('content').innerHTML=empty('noTasks');
  else if(!filtered.length)$('content').innerHTML=empty('noMatches');
  else {
    cancelAnimationFrame(decorativeRestoreFrame);document.body.classList.add('restoring-view');
    const groups=[['queued','待开始'],['running','进行中'],['review','待评审'],['completed','执行完成']];
    const unknown=filtered.filter(t=>column(t)==='unknown');
    $('content').innerHTML=(unknown.length?'<section class="attention"><h2>需要关注 · '+unknown.length+'</h2><div class="attention-grid">'+unknown.map(card).join('')+'</div></section>':'')+
      '<div class="board">'+groups.map(([key,label])=>{
        const tasks=filtered.filter(t=>column(t)===key);
        return '<section class="column"><h2><span class="stage-dot '+key+'" aria-hidden="true"></span><span>'+label+'</span><span class="column-count">'+tasks.length+'</span></h2><div class="column-body" data-column="'+key+'">'+(tasks.length?tasks.map(card).join(''):'<p class="column-empty">此阶段暂无已关联任务</p>')+'</div></section>';
      }).join('')+'</div>';
  }
  $('content').querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>{
    selectedTask=button.dataset.task;selectedAgent=button.dataset.agent;selectedOrg=undefined;
    focusOrigin=selectedTask?'[data-task="'+CSS.escape(selectedTask)+'"]':'[data-agent="'+CSS.escape(selectedAgent)+'"]';
    $('content').querySelectorAll('[aria-pressed]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    $('detail').scrollTop=0;detail();motion.animate($('detail'),[{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});$('close')?.focus({preventScroll:true});
  });
  $('content').querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>refresh().then(schedule));
  if(contentDetailsOpen && $('content').querySelector('details')) $('content').querySelector('details').open=true;
  $('sync').textContent='最近同步 '+time(data.snapshotAt)+' · 最近活动 '+time(snapshot.lastEventAt)+' · 只读视图'+(data.workspaceWarning?' · '+data.workspaceWarning:'');
  $('sync').title=data.snapshot.note;
  if(!orgCanvas||!$('detail').hidden)detail();$('content').scrollTop=scroll.top;$('content').scrollLeft=scroll.left;
  $('content').querySelectorAll('[data-column]').forEach(el=>el.scrollTop=columnScroll.get(el.dataset.column)||0);
  if(focusedSession)($('session-options').querySelector('[data-session="'+CSS.escape(focusedSession)+'"]')||$('session-label'))?.focus({preventScroll:true});
  else if(bannerFocused)($('review-banner').querySelector('[data-review-task="'+CSS.escape(bannerFocused)+'"]')||$('session-label'))?.focus({preventScroll:true});
  else if(detailFocused&&!$('artifact-dialog').open&&detailFocused.selection===$('detail').dataset.selection){
    const target=detailFocused.scroll?$('detail').querySelector('.detail-scroll'):[...$('detail').querySelectorAll('[data-navigation],[data-artifact-task],[data-review-task]')].find(el=>detailFocused.reviewTask?el.dataset.reviewTask===detailFocused.reviewTask:detailFocused.url?el.dataset.navigation===detailFocused.url:el.dataset.artifactTask===detailFocused.task&&el.dataset.artifactReference===detailFocused.reference);
    (target||$('close')||$(mode))?.focus({preventScroll:true});
  }
  else if(closeFocused&&!$('artifact-dialog').open)($('detail').hidden?$(mode):$('close'))?.focus({preventScroll:true});
  else if(detailSummaryFocused)($('detail').hidden?$(mode):$('detail').querySelector(detailSummaryFocused)||$(mode))?.focus({preventScroll:true});
  else if(contentSummaryFocused)($('content').querySelector('summary')||$(mode))?.focus({preventScroll:true});
  else if(focused)($('content').querySelector(focused)||$(mode))?.focus({preventScroll:true});
  if(mode==='kanban')animateCards($('content'),oldCards,changes,motion,text=>{$('motion-status').textContent=text;});
  if(document.body.classList.contains('restoring-view')){
    // 先提交恢复后的图形样式，再开放后续真实交互过渡。
    $('content').getBoundingClientRect();
    decorativeRestoreFrame=requestAnimationFrame(()=>document.body.classList.remove('restoring-view'));
  }
}
const selectorActivity=createSelectorActivityReader(async(project,session)=>{
  if(connected){
    const result=await app.callServerTool({name:'get_agent_team_probe',arguments:{projectId:project,...(session?{rootSessionId:session}:{})}},{timeout:10000});
    if(result.isError)throw Error('排序活动数据不可用');return result.structuredContent;
  }
  const url=new URL('/api/state',location.href);url.searchParams.set('projectId',project);if(session)url.searchParams.set('rootSessionId',session);
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('排序活动数据不可用');return response.json();
});
const reader=createSnapshotReader({
  isReady:()=>ready,isVisible:()=>!stopped&&!document.hidden,
  onBusy:value=>{$('content').setAttribute('aria-busy',String(value));},
  query:async (project,session)=>{
    let next;
    if(connected) {
      const result=await app.callServerTool({name:'get_agent_team_probe',arguments:{...(project?{projectId:project}:{}),...(session?{rootSessionId:session}:{})}},{timeout:10000});
      if(result.isError)throw new Error('数据查询失败');next=result.structuredContent;
    } else {
      const url=new URL('/api/state',location.href);if(project)url.searchParams.set('projectId',project);if(session)url.searchParams.set('rootSessionId',session);
      const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('HTTP '+response.status);next=await response.json();
    }
    if(next?.schemaVersion!==1||!Array.isArray(next.projects)||!Array.isArray(next.snapshot?.tasks))throw new Error('展示数据不可用');
    return selectorActivity(next);
  },
  onSnapshot:next=>{
    const changes=failureCount?[]:changedTasks(data,next);data=next;projectList=next.projects;requestedProject=next.selectedProjectId;requestedSession=next.selectedRootSessionId||undefined;failureCount=0;updateDecorativeMotion();render({changes});orgCanvas?.setOnline(true);$('bridge').classList.remove('error');
    $('bridge').textContent=(connected?'自动同步 · ':'浏览器预览 · ')+(next.snapshot.coverage==='partial'?'仅展示已接入的团队活动':'等待可用团队数据')+(next.selectorActivityUnavailable?' · 部分排序时间不可用':'');
  },
  onError:(error,context)=>{
    data=context.snapshot||undefined;motion.cancel();orgCanvas?.setOnline(false);
    failureCount=Math.min(failureCount+1,3);updateDecorativeMotion();$('bridge').classList.add('error');
    $('bridge').textContent='同步失败：'+error.message+(data?' · 正在显示最近快照':'');
    if(data)render();
    else{releaseCanvas();motion.cancel();$('review-banner').hidden=true;$('filters').hidden=true;$('detail').hidden=true;selectedTask=selectedAgent=selectedOrg=undefined;$('content').innerHTML=empty('error');$('content').querySelector('[data-retry]').onclick=()=>refresh().then(schedule);$('sync').textContent='当前会话尚无成功同步快照 · 只读视图';}
  }
});
function refresh(){return reader.request();}
function schedule() {clearTimeout(timer);if(stopped||document.hidden)return;timer=setTimeout(async()=>{await refresh();schedule();},Math.min(10000*2**failureCount,60000));}
$('workspace').onclick=()=>setPicker($('workspace-menu').hidden,true);
document.addEventListener('click',event=>{
  if(!$('picker').contains(event.target))setPicker(false);
  if(!event.target.closest('.session-picker'))$('session-label').parentElement.open=false;
  if(event.target.closest('#artifact-dialog,#detail,#picker,.session-picker,.org-tools,button,a,input,select,textarea,summary,[role="button"]'))return;
  if(selectedTask||selectedOrg||selectedAgent||orgCanvas?.hasSelection())closeDetail();
});
document.addEventListener('keydown',event=>{
  if($('artifact-dialog').open)return;
  const menu=$('workspace-menu');
  if(event.key==='Escape'&&$('session-label').parentElement.open){$('session-label').parentElement.open=false;$('session-label').focus();event.preventDefault();return;}
  if(!$('picker').contains(event.target)) {if(event.key==='Escape'&&(selectedTask||selectedAgent||orgCanvas?.hasSelection()))closeDetail();return;}
  if(event.key==='Escape'){setPicker(false);$('workspace').focus();event.preventDefault();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();if(menu.hidden){setPicker(true,true);return;}
    const options=[...menu.querySelectorAll('.option')],index=options.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options[next]?.focus();
  } else if(event.key==='Tab')setPicker(false);
});
document.addEventListener('focusin',event=>{if(!event.target.closest('.session-picker'))$('session-label').parentElement.open=false;});
$('search').oninput=()=>{search=$('search').value;selectedTask=undefined;render();};
$('clear-filters').onclick=()=>{search=roleFilter='';$('search').value='';render();};
$('artifact-close').onclick=()=>{artifactRequest++;$('artifact-dialog').close();};
$('artifact-dialog').addEventListener('close',()=>{
  artifactRequest++;
  const sameScope=artifactOrigin?.scope===JSON.stringify([data?.selectedProjectId,data?.selectedRootSessionId]);
  const target=sameScope?[...$('detail').querySelectorAll('[data-artifact-task]')].find(a=>a.dataset.artifactTask===artifactOrigin.taskId&&a.dataset.artifactReference===artifactOrigin.reference):null;
  (target||$('close')||$(mode))?.focus({preventScroll:true});
});
for(const name of ['kanban','org'])$(name).onclick=()=>{
  if(mode===name)return;releaseCanvas();motion.cancel();mode=name;selectedTask=selectedAgent=selectedOrg=undefined;$('detail').scrollTop=0;
  $('kanban').setAttribute('aria-selected',String(mode==='kanban'));$('org').setAttribute('aria-selected',String(mode==='org'));
  $('content').scrollTop=$('content').scrollLeft=0;
  if(data)render();
  else{$('content').setAttribute('aria-label',mode==='kanban'?'任务看板':'Agent 执行层级');$('content').innerHTML=empty(failureCount?'error':'loading');$('content').querySelector('[data-retry]').onclick=()=>refresh().then(schedule);}
};
document.addEventListener('visibilitychange',()=>{updateDecorativeMotion();clearTimeout(timer);if(document.hidden)motion.cancel();if(!document.hidden)refresh().then(schedule);});
window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
window.addEventListener('pageshow',()=>{stopped=false;refresh().then(schedule);});
function bindScope(project,session){releaseCanvas();motion.cancel();requestedProject=project;requestedSession=session;data=undefined;$('review-banner').hidden=true;selectedTask=selectedAgent=selectedOrg=undefined;$('detail').hidden=true;$('filters').hidden=true;$('content').innerHTML=empty('loading');return reader.select(project,session).then(schedule);}
app.onhostcontextchanged=host;
app.ontoolinput=params=>{receivedToolInput=true;const args=params.arguments||{};if(!userNavigated)bindScope(args.projectId,args.rootSessionId);};
app.ontoolresult=params=>{const value=params.structuredContent;if(!receivedToolInput&&!userNavigated&&value?.schemaVersion===1)bindScope(value.selectedProjectId,value.selectedRootSessionId||undefined);};
$('content').innerHTML=empty('loading');
if(window.parent===window)await refresh();
else {
  document.body.classList.add('embedded');
  try {await app.connect(undefined,{timeout:10000});connected=true;ready=true;host(app.getHostContext());await refresh();}
  catch(error){$('bridge').textContent='连接尚未就绪，可以重新打开页面';$('content').innerHTML=empty('error');$('content').querySelector('[data-retry]')?.remove();}
}
schedule();


