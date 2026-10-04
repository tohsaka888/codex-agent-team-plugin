import { renderTaskCard, renderKanbanBoard } from './cards-view.mjs';
import { renderEmpty } from './empty-view.mjs';
import { renderDetailContent } from './detail-view.mjs';
import { time } from './task-presentation.mjs';
import { html } from './html.mjs';
import { recentFirst, sessionOptions, createSelectorActivityReader } from './selector-order.mjs';
import { renderReviewBanner } from './human-review-view.mjs';
import { App, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { createOrgCanvas } from './org-canvas.mjs';
import { individualAgents, renderNativeGraphCard } from './dag-view.mjs';
import { createMotion, changedTasks, captureCards, animateCards } from './motion.mjs';
import { visibleTasks, taskColumn, taskLabel, kanbanCards } from './view-model.mjs';
import { createSnapshotReader } from './sync-query.mjs';
import { escapeHtml as safe } from './trace-detail.mjs';
import { canOpenNativeFile, openNativeFile } from './navigation.mjs';
const $ = (id) => document.getElementById(id);
const app = new App({ name: 'agent-team-readonly', version: '0.5.0' }, {});
let data,
  connected = false,
  mode = 'kanban',
  selectedTask,
  selectedAgent,
  selectedOrg,
  orgNodes = [],
  focusOrigin,
  requestedProject,
  projectList = [];
let timer,
  stopped = false,
  failureCount = 0;
const explicitHttp = new URLSearchParams(location.search).get('transport') === 'http';
let search = '',
  roleFilter = '',
  ready = explicitHttp || window.parent === window;
let receivedToolInput = false,
  toolInputSession = false,
  toolInputRootSessionId = null,
  userNavigated = false;
let automaticSessionSource = null;
let decorativeRestoreFrame;
const motion = createMotion(),
  canvasViews = new Map();
const decorativePreference = matchMedia('(prefers-reduced-motion: reduce)');
function updateDecorativeMotion() {
  document.body.dataset.decorativeMotion =
    document.hidden || stopped || failureCount || decorativePreference.matches
      ? 'paused'
      : 'running';
}
decorativePreference.addEventListener('change', updateDecorativeMotion);
updateDecorativeMotion();
let orgCanvas = null;
let artifactRequest = 0,
  navigationRequest = 0,
  artifactOrigin;
const artifactLink = (task, reference, label = reference) =>
  task && reference
    ? html`
        <a
          class="trace-link"
          href="#artifact"
          data-artifact-task="${safe(task.id)}"
          data-artifact-reference="${safe(reference)}"
        >
          ${safe(label)}
          <span aria-hidden="true">↗</span>
        </a>
      `
    : safe(label);
async function showArtifact(taskId, reference) {
  const token = ++artifactRequest,
    dialog = $('artifact-dialog');
  artifactOrigin = {
    taskId,
    reference,
    scope: JSON.stringify([data.selectedProjectId, data.selectedRootSessionId]),
  };
  $('artifact-title').textContent = '产物预览';
  $('artifact-path').textContent = reference;
  $('artifact-content').textContent = '正在读取已关联文件…';
  $('artifact-notice').textContent = '只读文件预览';
  if (!dialog.open) dialog.showModal();
  try {
    const params = {
      projectId: data.selectedProjectId,
      rootSessionId: data.selectedRootSessionId,
      taskId,
      reference,
    };
    let result;
    if (connected) {
      const response = await app.callServerTool(
        { name: 'get_agent_team_artifact', arguments: params },
        { timeout: 10000 },
      );
      if (response.isError)
        throw new Error(response.content?.find((c) => c.type === 'text')?.text || '文件预览不可用');
      result = response.structuredContent;
    } else {
      const url = new URL('/api/artifact', location.href);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '文件预览不可用');
      result = value;
    }
    if (token !== artifactRequest || !dialog.open) return;
    if (connected && canOpenNativeFile(app)) {
      await openNativeFile(app, result.path);
      if (token === artifactRequest && dialog.open) dialog.close();
      return;
    }
    $('artifact-title').textContent = result.title || '产物预览';
    $('artifact-path').textContent = result.path;
    $('artifact-content').textContent = result.binary
      ? '此文件无法以文本预览，请使用完整路径在 Codex 中打开。'
      : result.content;
    $('artifact-notice').textContent =
      '只读预览 · ' +
      result.size +
      ' 字节' +
      (result.truncated ? ' · 文件较大，仅展示前 120 KB' : '') +
      ' · 当前宿主未声明原生文件标签页能力';
    $('artifact-content').scrollTop = 0;
  } catch (error) {
    if (token === artifactRequest && dialog.open)
      $('artifact-content').textContent = '无法查看文件：' + error.message;
  }
}
function releaseCanvas() {
  if (orgCanvas) {
    orgCanvas.destroy();
    orgCanvas = null;
  }
}
function host(value) {
  if (value?.styles?.variables) applyHostStyleVariables(value.styles.variables);
  if (value?.styles?.css?.fonts) applyHostFonts(value.styles.css.fonts);
  if (value?.theme) document.documentElement.style.colorScheme = value.theme;
  const height = value?.containerDimensions?.height || value?.containerDimensions?.maxHeight;
  if (Number.isFinite(height) && height > 120)
    document.body.style.height = 'min(100dvh, ' + height + 'px)';
}
function column(task) {
  return taskColumn(task);
}

function card(task) {
  return renderTaskCard(task, selectedTask);
}
function empty(kind) {
  const workspace =
    kind === 'loading'
      ? null
      : projectList.find((project) => project.id === (requestedProject || data?.selectedProjectId));
  return renderEmpty(kind, { mode, workspace });
}
function setPicker(open, focus = false) {
  $('workspace-menu').hidden = !open;
  $('workspace').setAttribute('aria-expanded', String(open));
  if (open && focus) {
    (
      $('workspace-menu').querySelector('[aria-selected=true]') ||
      $('workspace-menu').querySelector('.option')
    )?.focus();
  }
}
function chooseWorkspace(id) {
  userNavigated = true;
  automaticSessionSource = null;
  releaseCanvas();
  motion.cancel();
  requestedProject = id;
  selectedTask = selectedAgent = selectedOrg = undefined;
  setPicker(false);
  $('workspace').focus();
  const project = projectList.find((p) => p.id === id);
  $('workspace-value').textContent = project ? project.name + ' · ' + project.hostName : '正在加载';
  data = undefined;
  failureCount = 0;
  $('review-banner').hidden = true;
  $('detail').hidden = true;
  $('filters').hidden = true;
  $('content').innerHTML = empty('loading');
  reader.select(id).then(schedule);
}
function updatePicker() {
  const active = document.activeElement?.dataset?.workspace;
  const signature = JSON.stringify(
    recentFirst(data.projects).map((p) => [p.id, p.name, p.hostName, p.path]),
  );
  if ($('workspace-menu').dataset.signature !== signature) {
    $('workspace-menu').innerHTML = recentFirst(data.projects)
      .map(
        (p) => html`
          <button
            class="option"
            role="option"
            aria-selected="${p.id === data.selectedProjectId}"
            data-workspace="${safe(p.id)}"
          >
            <span>${safe(p.name)} · ${safe(p.hostName)}${p.kind === 'remote' ? ' · SSH' : ''}</span>
            <small>${safe(p.path)}</small>
          </button>
        `,
      )
      .join('');
    $('workspace-menu').dataset.signature = signature;
    if (active)
      $('workspace-menu')
        .querySelector('[data-workspace="' + CSS.escape(active) + '"]')
        ?.focus();
  }
  $('workspace-menu')
    .querySelectorAll('.option')
    .forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.workspace === data.selectedProjectId));
      b.onclick = () => chooseWorkspace(b.dataset.workspace);
    });
  const current = data.projects.find((p) => p.id === data.selectedProjectId);
  $('workspace-value').textContent = current
    ? current.name + ' · ' + current.hostName + (current.kind === 'remote' ? ' · SSH' : '')
    : 'Workspace 不可用';
  $('workspace').title = current?.path || '';
}
function agentTask(agent) {
  if (agent.recentTask) return agent.recentTask;
  return (
    data.snapshot.tasks.find((t) => t.id === agent.currentTaskId) ||
    data.snapshot.tasks
      .filter((t) =>
        t.agentId
          ? t.agentId === agent.agentId || t.runs?.some((r) => r.agentId === agent.agentId)
          : t.nativeAgentId === agent.nativeAgentId,
      )
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]
  );
}
function agentCard(agent) {
  return renderNativeGraphCard(agent, agentTask(agent), selectedOrg);
}
function detail() {
  const panel = $('detail');
  const scroll = panel.querySelector('.detail-scroll')?.scrollTop || 0;
  const selection = selectedTask || selectedOrg || selectedAgent;
  const sameSelection = panel.dataset.selection === selection;
  const active = document.activeElement;
  const focus =
    sameSelection && panel.contains(active)
      ? {
          scroll: active.classList.contains('detail-scroll'),
          url: active.dataset.navigation,
          task: active.dataset.artifactTask,
          reference: active.dataset.artifactReference,
          reviewTask: active.dataset.reviewTask,
          close: active.id === 'close',
          summary:
            active.tagName === 'SUMMARY' ? '.' + active.parentElement.className + ' summary' : null,
        }
      : null;
  const wasOpen = sameSelection && panel.querySelector('.diagnostic')?.open;
  const historyOpen = sameSelection && panel.querySelector('.task-history')?.open;
  const instancesOpen = sameSelection && panel.querySelector('.instance-history')?.open;
  const reviewHistoryOpen = sameSelection && panel.querySelector('.review-history')?.open;
  const task = data && kanbanCards(data.snapshot.tasks).find((task) => task.id === selectedTask);
  const roleNode = orgNodes.find((node) => node.orgNodeId === selectedOrg);
  const agent =
    roleNode ||
    data?.snapshot.agents.find((agent) => (agent.agentId || agent.nativeAgentId) === selectedAgent);
  panel.hidden = !task && !agent;
  if (!task && !agent) return;
  const { markup, linkedTask } = renderDetailContent({
    task,
    agent,
    roleNode,
    data,
    projectList,
    agentTask,
    artifactLink,
  });
  $('detail').innerHTML = markup;
  $('detail').dataset.selection = selection;
  $('detail').querySelector('.diagnostic').open = Boolean(wasOpen);
  $('detail').querySelector('.review-history').open = Boolean(reviewHistoryOpen);
  bindReviewTasks($('detail'));
  if ($('detail').querySelector('.task-history'))
    $('detail').querySelector('.task-history').open = Boolean(historyOpen);
  if ($('detail').querySelector('.instance-history'))
    $('detail').querySelector('.instance-history').open = Boolean(instancesOpen);
  $('detail').querySelector('.detail-scroll').scrollTop = sameSelection ? scroll : 0;
  $('close').onclick = closeDetail;
  $('detail')
    .querySelectorAll('[data-navigation]')
    .forEach(
      (link) =>
        (link.onclick = async (event) => {
          event.preventDefault();
          const token = ++navigationRequest,
            scope = JSON.stringify([data.selectedProjectId, data.selectedRootSessionId]);
          $('navigation-notice').hidden = true;
          try {
            if (!connected || !canOpenNativeFile(app))
              throw new Error('当前环境不支持原生执行记录标签页');
            const nativeAgentId = link.dataset.navigation.split('/').pop();
            const sourceTask =
              data.snapshot.tasks.find((t) => t.id === linkedTask?.parentTaskId) ||
              data.snapshot.tasks.find((t) => t.nativeAgentId === nativeAgentId) ||
              linkedTask;
            if (!sourceTask) throw new Error('执行实例缺少关联任务');
            const result = await app.callServerTool(
              {
                name: 'get_agent_team_artifact',
                arguments: {
                  projectId: data.selectedProjectId,
                  rootSessionId: data.selectedRootSessionId,
                  taskId: sourceTask.id,
                  reference: 'execution://' + nativeAgentId,
                },
              },
              { timeout: 20000 },
            );
            if (result.isError)
              throw new Error(
                result.content?.find((c) => c.type === 'text')?.text || '执行记录不可用',
              );
            if (
              token !== navigationRequest ||
              scope !== JSON.stringify([data?.selectedProjectId, data?.selectedRootSessionId])
            )
              return;
            await openNativeFile(app, result.structuredContent.path);
          } catch (error) {
            if (
              token !== navigationRequest ||
              scope !== JSON.stringify([data?.selectedProjectId, data?.selectedRootSessionId])
            )
              return;
            $('navigation-notice').textContent = '无法打开执行记录：' + error.message;
            $('navigation-notice').hidden = false;
          }
        }),
    );
  $('detail')
    .querySelectorAll('[data-artifact-task]')
    .forEach(
      (link) =>
        (link.onclick = (event) => {
          event.preventDefault();
          showArtifact(link.dataset.artifactTask, link.dataset.artifactReference);
        }),
    );
  if (focus && !$('artifact-dialog').open) {
    const target = focus.scroll
      ? $('detail').querySelector('.detail-scroll')
      : focus.close
        ? $('close')
        : focus.summary
          ? $('detail').querySelector(focus.summary)
          : [
              ...$('detail').querySelectorAll(
                '[data-navigation],[data-artifact-task],[data-review-task]',
              ),
            ].find((el) =>
              focus.reviewTask
                ? el.dataset.reviewTask === focus.reviewTask
                : focus.url
                  ? el.dataset.navigation === focus.url
                  : focus.task &&
                    el.dataset.artifactTask === focus.task &&
                    el.dataset.artifactReference === focus.reference,
            );
    (target?.getClientRects().length ? target : $('close'))?.focus({ preventScroll: true });
  }
}
function closeDetail() {
  orgCanvas?.close();
  selectedTask = selectedAgent = selectedOrg = undefined;
  detail();
  $('content')
    .querySelectorAll('[aria-pressed]')
    .forEach((b) => b.setAttribute('aria-pressed', 'false'));
  const target = focusOrigin ? $('content').querySelector(focusOrigin) : null;
  (target || $(mode))?.focus();
}
function bindReviewTasks(container) {
  container.querySelectorAll('[data-review-task]').forEach(
    (button) =>
      (button.onclick = () => {
        if (!data?.snapshot.tasks.some((t) => t.id === button.dataset.reviewTask)) return;
        if (mode !== 'kanban') $('kanban').click();
        selectedTask = button.dataset.reviewTask;
        selectedAgent = selectedOrg = undefined;
        focusOrigin = '[data-task="' + CSS.escape(selectedTask) + '"]';
        render();
        $('close')?.focus({ preventScroll: true });
      }),
  );
}
function render({ changes = [] } = {}) {
  const oldCards = mode === 'kanban' ? captureCards($('content')) : new Map();
  if (mode === 'kanban') motion.cancel();
  const active = document.activeElement;
  const focusedSession = active?.dataset?.session;
  const bannerFocused = $('review-banner').contains(active) ? active?.dataset?.reviewTask : null;
  const focused = active?.dataset?.task
    ? '[data-task="' + CSS.escape(active.dataset.task) + '"]'
    : active?.dataset?.orgNode
      ? '[data-org-node="' + CSS.escape(active.dataset.orgNode) + '"]'
      : active?.dataset?.agent
        ? '[data-agent="' + CSS.escape(active.dataset.agent) + '"]'
        : null;
  const closeFocused = active?.id === 'close';
  const detailFocused =
    $('detail').contains(active) &&
    active?.matches('.detail-scroll,[data-navigation],[data-artifact-task],[data-review-task]')
      ? {
          selection: $('detail').dataset.selection,
          scroll: active.classList.contains('detail-scroll'),
          url: active.dataset.navigation,
          task: active.dataset.artifactTask,
          reference: active.dataset.artifactReference,
          reviewTask: active.dataset.reviewTask,
        }
      : null;
  const detailSummaryFocused =
    active?.tagName === 'SUMMARY' && $('detail').contains(active)
      ? '.' + active.parentElement.className + ' summary'
      : null;
  const contentSummaryFocused = active?.tagName === 'SUMMARY' && $('content').contains(active);
  const contentDetailsOpen = $('content').querySelector('details')?.open;
  const scroll = { top: $('content').scrollTop, left: $('content').scrollLeft };
  const scope = JSON.stringify([data.selectedProjectId, data.selectedRootSessionId]);
  const columnScroll =
    $('content').dataset.scope === scope
      ? new Map(
          [...$('content').querySelectorAll('[data-column]')].map((el) => [
            el.dataset.column,
            el.scrollTop,
          ]),
        )
      : new Map();
  $('content').dataset.scope = scope;
  const { snapshot } = data;
  updatePicker();
  const banner = renderReviewBanner(snapshot.tasks);
  $('review-banner').innerHTML = banner;
  $('review-banner').hidden = !banner;
  bindReviewTasks($('review-banner'));
  orgNodes = individualAgents(snapshot.agents, snapshot.tasks);
  if (selectedOrg) {
    const current = orgNodes.find((n) => n.orgNodeId === selectedOrg);
    selectedAgent = current?.agentId || current?.nativeAgentId;
  }
  if (
    mode !== 'org' ||
    snapshot.coverage !== 'partial' ||
    (!snapshot.agents.length && !snapshot.tasks.length)
  )
    releaseCanvas();
  const sessions = sessionOptions(data.sessions || []);
  const sessionSignature = JSON.stringify([sessions, data.selectedRootSessionId]);
  if ($('session-options').dataset.signature !== sessionSignature) {
    $('session-options').innerHTML = sessions.length
      ? sessions
          .map(
            (s) => html`
              <button
                data-session="${safe(s.id)}"
                aria-pressed="${s.id === data.selectedRootSessionId}"
                title="${safe(s.id)}"
              >
                ${safe(s.displayTitle)}
              </button>
            `,
          )
          .join('')
      : html`
          <p class="muted session-empty" role="status">当前工作区暂无可选择的主会话</p>
        `;
    $('session-options').dataset.signature = sessionSignature;
  }
  $('session-options')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          userNavigated = true;
          $('session-label').parentElement.open = false;
          $('session-label').focus();
          bindScope(data.selectedProjectId, b.dataset.session);
        }),
    );
  const selectedSession = sessions.find((s) => s.id === data.selectedRootSessionId);
  $('session-label').textContent =
    (automaticSessionSource?.startsWith('recent-') ? '自动 · ' : '') +
    (selectedSession
      ? '主会话 · ' + selectedSession.displayTitle
      : data.selectedRootSessionId
        ? '当前主会话（未命名）'
        : '选择主会话');
  const selectionReason = {
    'invocation-environment': '已匹配插件调用环境中的会话',
    'recent-active': '自动选择当前工作区最近活动的进行中会话',
    'recent-session': '未发现进行中会话，自动选择最近会话',
  }[automaticSessionSource || data.sessionSelectionSource];
  $('session-label').title =
    [selectionReason, data.selectedRootSessionId].filter(Boolean).join(' · ') || '选择一个主会话';
  $('filters').hidden = snapshot.coverage !== 'partial' || !snapshot.tasks.length;
  const roles = [
    ...new Set(
      snapshot.tasks.flatMap((task) => [taskLabel(task), ...(task.runs || []).map(taskLabel)]),
    ),
  ].sort();
  const signature = JSON.stringify(roles);
  if ($('roles').dataset.signature !== signature) {
    $('roles').innerHTML = ['', ...roles]
      .map(
        (role) => html`
          <button data-role="${safe(role)}">${safe(role || '全部')}</button>
        `,
      )
      .join('');
    $('roles').dataset.signature = signature;
  }
  $('roles')
    .querySelectorAll('button')
    .forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.role === roleFilter));
      b.onclick = () => {
        roleFilter = b.dataset.role;
        selectedTask = undefined;
        render();
      };
    });
  const filtered = visibleTasks(snapshot.tasks, search, roleFilter);
  $('coverage').textContent =
    {
      partial: '已接入部分数据',
      unobserved: '尚未收到活动',
      unavailable: '远程活动未接入',
      'session-required': '等待选择会话',
    }[snapshot.coverage] || '数据状态未知';
  $('content').setAttribute('aria-label', mode === 'kanban' ? '任务看板' : 'Agent 执行层级');
  if (snapshot.coverage !== 'partial') $('content').innerHTML = empty(snapshot.coverage);
  else if (mode === 'org') {
    if (!snapshot.agents.length && !snapshot.tasks.length)
      $('content').innerHTML = empty('noAgents');
    else {
      if (!orgCanvas) {
        const key = JSON.stringify([data.selectedProjectId, data.selectedRootSessionId]);
        orgCanvas = createOrgCanvas({
          container: $('content'),
          detail: $('detail'),
          card: agentCard,
          motion,
          initialView: canvasViews.get(key),
          onView: (value) => canvasViews.set(key, value),
          onClose: closeDetail,
          onSelect: (id, node) => {
            selectedTask = node.task?.id;
            selectedOrg = node.task ? undefined : id;
            const selectedNode = orgNodes.find((n) => n.orgNodeId === id);
            selectedAgent = selectedNode?.agentId || selectedNode?.nativeAgentId;
            focusOrigin = '[data-org-node="' + CSS.escape(id) + '"]';
            detail();
          },
        });
      }
      orgCanvas.update(orgNodes, filtered);
    }
  } else if (!snapshot.tasks.length) $('content').innerHTML = empty('noTasks');
  else if (!filtered.length) $('content').innerHTML = empty('noMatches');
  else {
    cancelAnimationFrame(decorativeRestoreFrame);
    document.body.classList.add('restoring-view');
    const unknown = kanbanCards(filtered).filter((t) => column(t) === 'unknown');
    $('content').innerHTML =
      (unknown.length
        ? html`
            <section class="attention">
              <h2>需要关注 · ${unknown.length}</h2>
              <div class="attention-grid">${unknown.map(card).join('')}</div>
            </section>
          `
        : '') + renderKanbanBoard(filtered, selectedTask);
  }
  $('content')
    .querySelectorAll('[data-task]')
    .forEach(
      (button) =>
        (button.onclick = () => {
          selectedTask = button.dataset.task;
          selectedAgent = button.dataset.agent;
          selectedOrg = undefined;
          focusOrigin = selectedTask
            ? '[data-task="' + CSS.escape(selectedTask) + '"]'
            : '[data-agent="' + CSS.escape(selectedAgent) + '"]';
          $('content')
            .querySelectorAll('[aria-pressed]')
            .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
          $('detail').scrollTop = 0;
          detail();
          motion.animate(
            $('detail'),
            [
              { opacity: 0, transform: 'translateX(12px)' },
              { opacity: 1, transform: 'translateX(0)' },
            ],
            { duration: 180, easing: 'ease-out' },
          );
          $('close')?.focus({ preventScroll: true });
        }),
    );
  $('content')
    .querySelectorAll('[data-retry]')
    .forEach((b) => (b.onclick = () => refresh().then(schedule)));
  if (contentDetailsOpen && $('content').querySelector('details'))
    $('content').querySelector('details').open = true;
  $('sync').textContent =
    '最近同步 ' +
    time(data.snapshotAt) +
    ' · 最近活动 ' +
    time(snapshot.lastEventAt) +
    ' · 只读视图' +
    (data.workspaceWarning ? ' · ' + data.workspaceWarning : '');
  $('sync').title = data.snapshot.note;
  if (!orgCanvas || !$('detail').hidden) detail();
  $('content').scrollTop = scroll.top;
  $('content').scrollLeft = scroll.left;
  $('content')
    .querySelectorAll('[data-column]')
    .forEach((el) => (el.scrollTop = columnScroll.get(el.dataset.column) || 0));
  if (focusedSession)
    (
      $('session-options').querySelector('[data-session="' + CSS.escape(focusedSession) + '"]') ||
      $('session-label')
    )?.focus({ preventScroll: true });
  else if (bannerFocused)
    (
      $('review-banner').querySelector('[data-review-task="' + CSS.escape(bannerFocused) + '"]') ||
      $('session-label')
    )?.focus({ preventScroll: true });
  else if (
    detailFocused &&
    !$('artifact-dialog').open &&
    detailFocused.selection === $('detail').dataset.selection
  ) {
    const target = detailFocused.scroll
      ? $('detail').querySelector('.detail-scroll')
      : [
          ...$('detail').querySelectorAll(
            '[data-navigation],[data-artifact-task],[data-review-task]',
          ),
        ].find((el) =>
          detailFocused.reviewTask
            ? el.dataset.reviewTask === detailFocused.reviewTask
            : detailFocused.url
              ? el.dataset.navigation === detailFocused.url
              : el.dataset.artifactTask === detailFocused.task &&
                el.dataset.artifactReference === detailFocused.reference,
        );
    (target || $('close') || $(mode))?.focus({ preventScroll: true });
  } else if (closeFocused && !$('artifact-dialog').open)
    ($('detail').hidden ? $(mode) : $('close'))?.focus({ preventScroll: true });
  else if (detailSummaryFocused)
    ($('detail').hidden
      ? $(mode)
      : $('detail').querySelector(detailSummaryFocused) || $(mode)
    )?.focus({ preventScroll: true });
  else if (contentSummaryFocused)
    ($('content').querySelector('summary') || $(mode))?.focus({ preventScroll: true });
  else if (focused)
    ($('content').querySelector(focused) || $(mode))?.focus({ preventScroll: true });
  if (mode === 'kanban')
    animateCards($('content'), oldCards, changes, motion, (text) => {
      $('motion-status').textContent = text;
    });
  if (document.body.classList.contains('restoring-view')) {
    // 先提交恢复后的图形样式，再开放后续真实交互过渡。
    $('content').getBoundingClientRect();
    decorativeRestoreFrame = requestAnimationFrame(() =>
      document.body.classList.remove('restoring-view'),
    );
  }
}
const selectorActivity = createSelectorActivityReader(async (project, session) => {
  if (connected) {
    const result = await app.callServerTool(
      {
        name: 'get_agent_team_probe',
        arguments: { projectId: project, ...(session ? { rootSessionId: session } : {}) },
      },
      { timeout: 10000 },
    );
    if (result.isError) throw Error('排序活动数据不可用');
    return result.structuredContent;
  }
  const url = new URL('/api/state', location.href);
  url.searchParams.set('projectId', project);
  if (session) url.searchParams.set('rootSessionId', session);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('排序活动数据不可用');
  return response.json();
});
const reader = createSnapshotReader({
  isReady: () => ready,
  isVisible: () => !stopped && !document.hidden,
  onBusy: (value) => {
    $('content').setAttribute('aria-busy', String(value));
  },
  query: async (project, session) => {
    let next;
    if (connected) {
      const result = await app.callServerTool(
        {
          name: 'get_agent_team_probe',
          arguments: {
            ...(project ? { projectId: project } : {}),
            ...(session ? { rootSessionId: session } : { autoSelectSession: true }),
          },
        },
        { timeout: 10000 },
      );
      if (result.isError) throw new Error('数据查询失败');
      next = result.structuredContent;
    } else {
      const url = new URL('/api/state', location.href);
      if (project) url.searchParams.set('projectId', project);
      if (session) url.searchParams.set('rootSessionId', session);
      else url.searchParams.set('autoSelectSession', 'true');
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      next = await response.json();
    }
    if (
      next?.schemaVersion !== 1 ||
      !Array.isArray(next.projects) ||
      !Array.isArray(next.snapshot?.tasks)
    )
      throw new Error('展示数据不可用');
    return selectorActivity(next);
  },
  onSnapshot: (next) => {
    if (next.sessionSelectionSource && next.sessionSelectionSource !== 'explicit')
      automaticSessionSource = next.sessionSelectionSource;
    else if (userNavigated) automaticSessionSource = null;
    const changes = failureCount ? [] : changedTasks(data, next);
    data = next;
    projectList = next.projects;
    requestedProject = next.selectedProjectId;
    failureCount = 0;
    updateDecorativeMotion();
    render({ changes });
    orgCanvas?.setOnline(true);
    $('bridge').classList.remove('error');
    $('bridge').textContent =
      (connected ? '自动同步 · ' : '浏览器预览 · ') +
      (next.snapshot.coverage === 'partial' ? '仅展示已接入的团队活动' : '等待可用团队数据') +
      (next.selectorActivityUnavailable ? ' · 部分排序时间不可用' : '');
  },
  onError: (error, context) => {
    data = context.snapshot || undefined;
    motion.cancel();
    orgCanvas?.setOnline(false);
    failureCount = Math.min(failureCount + 1, 3);
    updateDecorativeMotion();
    $('bridge').classList.add('error');
    $('bridge').textContent = '同步失败：' + error.message + (data ? ' · 正在显示最近快照' : '');
    if (data) render();
    else {
      releaseCanvas();
      motion.cancel();
      $('review-banner').hidden = true;
      $('filters').hidden = true;
      $('detail').hidden = true;
      selectedTask = selectedAgent = selectedOrg = undefined;
      $('content').innerHTML = empty('error');
      $('content').querySelector('[data-retry]').onclick = () => refresh().then(schedule);
      $('sync').textContent = '当前会话尚无成功同步快照 · 只读视图';
    }
  },
});
function refresh() {
  return reader.request();
}
function schedule() {
  clearTimeout(timer);
  if (stopped || document.hidden) return;
  timer = setTimeout(
    async () => {
      await refresh();
      schedule();
    },
    Math.min(10000 * 2 ** failureCount, 60000),
  );
}
$('workspace').onclick = () => setPicker($('workspace-menu').hidden, true);
document.addEventListener('click', (event) => {
  if (!$('picker').contains(event.target)) setPicker(false);
  if (!event.target.closest('.session-picker')) $('session-label').parentElement.open = false;
  if (
    event.target.closest(
      '#artifact-dialog,#detail,#picker,.session-picker,.org-tools,button,a,input,select,textarea,summary,[role="button"]',
    )
  )
    return;
  if (selectedTask || selectedOrg || selectedAgent || orgCanvas?.hasSelection()) closeDetail();
});
document.addEventListener('keydown', (event) => {
  if ($('artifact-dialog').open) return;
  const menu = $('workspace-menu');
  if (event.key === 'Escape' && $('session-label').parentElement.open) {
    $('session-label').parentElement.open = false;
    $('session-label').focus();
    event.preventDefault();
    return;
  }
  if (!$('picker').contains(event.target)) {
    if (event.key === 'Escape' && (selectedTask || selectedAgent || orgCanvas?.hasSelection()))
      closeDetail();
    return;
  }
  if (event.key === 'Escape') {
    setPicker(false);
    $('workspace').focus();
    event.preventDefault();
    return;
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (menu.hidden) {
      setPicker(true, true);
      return;
    }
    const options = [...menu.querySelectorAll('.option')],
      index = options.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  } else if (event.key === 'Tab') setPicker(false);
});
document.addEventListener('focusin', (event) => {
  if (!event.target.closest('.session-picker')) $('session-label').parentElement.open = false;
});
$('search').oninput = () => {
  search = $('search').value;
  selectedTask = undefined;
  render();
};
$('clear-filters').onclick = () => {
  search = roleFilter = '';
  $('search').value = '';
  render();
};
$('artifact-close').onclick = () => {
  artifactRequest++;
  $('artifact-dialog').close();
};
$('artifact-dialog').addEventListener('close', () => {
  artifactRequest++;
  const sameScope =
    artifactOrigin?.scope ===
    JSON.stringify([data?.selectedProjectId, data?.selectedRootSessionId]);
  const target = sameScope
    ? [...$('detail').querySelectorAll('[data-artifact-task]')].find(
        (a) =>
          a.dataset.artifactTask === artifactOrigin.taskId &&
          a.dataset.artifactReference === artifactOrigin.reference,
      )
    : null;
  (target || $('close') || $(mode))?.focus({ preventScroll: true });
});
for (const name of ['kanban', 'org'])
  $(name).onclick = () => {
    if (mode === name) return;
    releaseCanvas();
    motion.cancel();
    mode = name;
    selectedTask = selectedAgent = selectedOrg = undefined;
    $('detail').scrollTop = 0;
    $('kanban').setAttribute('aria-selected', String(mode === 'kanban'));
    $('org').setAttribute('aria-selected', String(mode === 'org'));
    $('content').scrollTop = $('content').scrollLeft = 0;
    if (data) render();
    else {
      $('content').setAttribute('aria-label', mode === 'kanban' ? '任务看板' : 'Agent 执行层级');
      $('content').innerHTML = empty(failureCount ? 'error' : 'loading');
      $('content').querySelector('[data-retry]').onclick = () => refresh().then(schedule);
    }
  };
document.addEventListener('visibilitychange', () => {
  updateDecorativeMotion();
  clearTimeout(timer);
  if (document.hidden) motion.cancel();
  if (!document.hidden) refresh().then(schedule);
});
window.addEventListener('pagehide', () => {
  stopped = true;
  clearTimeout(timer);
});
window.addEventListener('pageshow', () => {
  stopped = false;
  refresh().then(schedule);
});
function bindScope(project, session) {
  releaseCanvas();
  motion.cancel();
  requestedProject = project;
  data = undefined;
  $('review-banner').hidden = true;
  selectedTask = selectedAgent = selectedOrg = undefined;
  $('detail').hidden = true;
  $('filters').hidden = true;
  $('content').innerHTML = empty('loading');
  return reader.select(project, session).then(schedule);
}
app.onhostcontextchanged = host;
app.ontoolinput = (params) => {
  receivedToolInput = true;
  const args = params.arguments || {};
  toolInputSession = Boolean(args.rootSessionId);
  toolInputRootSessionId = args.rootSessionId || null;
  if (!userNavigated) bindScope(args.projectId, args.rootSessionId);
};
app.ontoolresult = (params) => {
  const value = params.structuredContent;
  if (
    !userNavigated &&
    value?.schemaVersion === 1 &&
    (!receivedToolInput ||
      (!toolInputSession && value.selectedRootSessionId) ||
      (value.projectSelectionSource === 'native-session' &&
        value.selectedRootSessionId === toolInputRootSessionId))
  ) {
    automaticSessionSource = value.sessionSelectionSource || null;
    bindScope(value.selectedProjectId, value.selectedRootSessionId || undefined);
  }
};
$('content').innerHTML = empty('loading');
if (explicitHttp || window.parent === window) await refresh();
else {
  document.body.classList.add('embedded');
  try {
    await app.connect(undefined, { timeout: 10000 });
    connected = true;
    ready = true;
    host(app.getHostContext());
    await refresh();
  } catch (error) {
    $('bridge').textContent = '连接尚未就绪，可以重新打开页面';
    $('content').innerHTML = empty('error');
    $('content').querySelector('[data-retry]')?.remove();
  }
}
schedule();
