import { html } from './html.mjs';
import { layoutOrg, revealNode } from './canvas-layout.mjs';
import { layoutDag, renderDagCard, executionRecords } from './dag-view.mjs';
import { orgId } from './org-view.mjs';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const safe = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export function createOrgCanvas({
  container,
  detail,
  card,
  motion,
  onSelect,
  onClose,
  initialView,
  onView,
}) {
  container.classList.add('canvas-content');
  container.innerHTML = html`
    <section
      class="org-canvas"
      tabindex="0"
      aria-label="Agent 画布，拖动空白平移，方向键平移，加减号缩放"
    >
      <div class="org-world">
        <svg class="org-edges" aria-hidden="true">
          <g></g>
        </svg>
        <div class="org-nodes"></div>
      </div>
    </section>
    <div class="org-legend">全量执行 · 连线表示关系；飞线仅强调聚焦</div>
    <div class="org-tools">
      <select class="org-mode" aria-label="关系类型">
        <option value="dag">任务依赖 DAG</option>
        <option value="native">原生 Agent 父子关系</option>
      </select>
      <button data-action="out" aria-label="缩小画布">−</button>
      <output>100%</output>
      <button data-action="in" aria-label="放大画布">+</button>
      <button data-action="fit">适配全图</button>
      <button data-action="locate">定位选中</button>
      <button data-action="flight" aria-pressed="true">飞线开启</button>
    </div>
  `;
  const surface = container.querySelector('.org-canvas'),
    world = container.querySelector('.org-world'),
    nodeLayer = container.querySelector('.org-nodes'),
    lineLayer = container.querySelector('.org-edges g'),
    svg = container.querySelector('svg');
  const layoutBox = container.parentElement;
  let graph = { nodes: [], edges: [], width: 300, height: 200 },
    view = initialView || { x: 24, y: 32, scale: 1 },
    selected = null,
    version = 0,
    camera = null,
    drag = null,
    flights = true,
    online = true,
    disposed = false,
    initialized = Boolean(initialView),
    graphMode = 'dag',
    lastAgents = [],
    lastTasks = [];
  const apply = () => {
    world.style.transform =
      'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
    container.querySelector('output').textContent = Math.round(view.scale * 100) + '%';
    onView({ ...view });
  };
  function sample() {
    if (camera) {
      const m = new DOMMatrixReadOnly(getComputedStyle(world).transform);
      view = { x: m.e, y: m.f, scale: m.a };
      camera.cancel();
      camera = null;
      apply();
    }
  }
  function cancel() {
    version++;
    sample();
    detail.getAnimations().forEach((a) => a.cancel());
  }
  async function move(next) {
    sample();
    const from = world.style.transform;
    view = next;
    apply();
    const animation = motion.animate(
      world,
      [{ transform: from }, { transform: world.style.transform }],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    if (!animation) return;
    camera = animation;
    try {
      await animation.finished;
    } catch {
    } finally {
      if (camera === animation) camera = null;
    }
  }
  function planned() {
    const w = surface.clientWidth,
      h = surface.clientHeight,
      bottom = w < 820;
    return {
      bottom,
      safeRect: {
        x: 24,
        y: 24,
        width: w - (bottom ? 48 : 408),
        height: h - (bottom ? h * 0.45 + 104 : 104),
      },
    };
  }
  function focusSet() {
    const ids = new Set(selected ? [selected] : []);
    if (!selected) return ids;
    for (const e of graph.edges)
      if (e.from === selected || e.to === selected) {
        ids.add(e.from);
        ids.add(e.to);
      }
    const queue = [selected],
      seen = new Set();
    while (queue.length) {
      const cursor = queue.pop();
      if (seen.has(cursor)) continue;
      seen.add(cursor);
      for (const edge of graph.edges.filter((e) => e.to === cursor)) {
        ids.add(edge.from);
        queue.push(edge.from);
      }
    }
    return ids;
  }
  function highlight() {
    const related = focusSet();
    nodeLayer.querySelectorAll('.org-node').forEach((el) => {
      el.classList.toggle('selected', el.dataset.id === selected);
      el.classList.toggle('dimmed', Boolean(selected) && !related.has(el.dataset.id));
      el.classList.toggle('related', related.has(el.dataset.id));
      el.querySelector('[data-agent]')?.setAttribute(
        'aria-pressed',
        String(el.dataset.id === selected),
      );
    });
    const byId = new Map(graph.nodes.map((n) => [orgId(n), n]));
    let activeCount = 0;
    const markup = graph.edges
      .map((e) => {
        const a = byId.get(e.from),
          b = byId.get(e.to),
          x = a.x + a.width / 2,
          y = a.y + a.height,
          xx = b.x + b.width / 2,
          yy = b.y;
        let path =
          'M' +
          x +
          ',' +
          y +
          ' C' +
          x +
          ',' +
          (y + 50) +
          ' ' +
          xx +
          ',' +
          (yy - 50) +
          ' ' +
          xx +
          ',' +
          yy;
        if (e.kind === 'dependency') {
          // 依赖线共用右侧通道，重叠段合并为同一条视觉主干。
          const lane = graph.width - 210;
          const fromX = a.x + a.width,
            fromY = a.y + a.height / 2;
          const toX = b.x + b.width,
            toY = b.y + b.height / 2;
          path = 'M' + fromX + ',' + fromY + ' H' + lane + ' V' + toY + ' H' + toX;
        }
        const focused = Boolean(selected) && related.has(e.from) && related.has(e.to),
          animated =
            focused &&
            flights &&
            online &&
            !motion.reduced() &&
            !document.hidden &&
            activeCount++ < 8;
        return html`
          <path
            class="org-edge ${e.kind === 'membership' ? 'membership-edge' : ''} ${focused ? 'focused' : ''}"
            d="${path}"
          />
          ${
            animated
              ? html`
                  <path class="org-flight playing" pathLength="100" d="${path}" />
                  <circle class="org-particle" r="2.5" opacity="0">
                    <animateMotion path="${path}" dur="2.4s" repeatCount="3" />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      keyTimes="0;.12;.88;1"
                      dur="2.4s"
                      repeatCount="3"
                      fill="freeze"
                    />
                  </circle>
                `
              : ''
          }
        `;
      })
      .join('');
    const signature = selected + '|' + markup;
    if (lineLayer.dataset.signature !== signature) {
      lineLayer.innerHTML = markup;
      lineLayer.dataset.signature = signature;
    }
  }
  async function select(id, { focus = true, animatePanel = true } = {}) {
    cancel();
    const token = version,
      node = graph.nodes.find((n) => orgId(n) === id);
    if (!node) return;
    const keepPanel = selected === id && !focus && !detail.hidden;
    selected = id;
    highlight();
    layoutBox.classList.add('org-layout');
    if (!keepPanel) {
      layoutBox.classList.remove('detail-bottom', 'detail-standalone');
      detail.hidden = true;
    }
    const plan = planned(),
      target = revealNode({ node, view, safeRect: plan.safeRect });
    if (target) await move(target);
    if (token !== version || disposed) return;
    layoutBox.classList.toggle('detail-bottom', plan.bottom && Boolean(target));
    layoutBox.classList.toggle('detail-standalone', !target);
    onSelect(id, node);
    detail.hidden = false;
    if (animatePanel && !keepPanel)
      motion.animate(
        detail,
        [
          { opacity: 0, transform: plan.bottom ? 'translateY(16px)' : 'translateX(16px)' },
          { opacity: 1, transform: 'translate(0)' },
        ],
        { duration: 180, easing: 'ease-out' },
      );
    if (focus) detail.querySelector('#close')?.focus({ preventScroll: true });
  }
  function close() {
    cancel();
    selected = null;
    highlight();
    layoutBox.classList.remove('detail-bottom', 'detail-standalone');
    detail.hidden = true;
  }
  async function fit() {
    cancel();
    const w = surface.clientWidth,
      h = surface.clientHeight,
      plan = planned(),
      hasDetail = !detail.hidden;
    const maxWidth = hasDetail ? plan.safeRect.width + 24 : w - 48,
      maxHeight = hasDetail ? plan.safeRect.height + 24 : h - 100;
    const scale = clamp(Math.min(maxWidth / graph.width, maxHeight / graph.height), 0.2, 1);
    await move({ x: (w - graph.width * scale) / 2, y: 32, scale });
  }
  function zoom(factor, px = surface.clientWidth / 2, py = surface.clientHeight / 2) {
    cancel();
    const scale = clamp(view.scale * factor, 0.2, 1.8);
    view = {
      x: px - ((px - view.x) * scale) / view.scale,
      y: py - ((py - view.y) * scale) / view.scale,
      scale,
    };
    apply();
  }
  let suppressBlankClick = false;
  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.org-node')) return;
    cancel();
    suppressBlankClick = false;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: view.x, ty: view.y, moved: false };
    surface.setPointerCapture(e.pointerId);
    surface.classList.add('dragging');
    e.preventDefault();
  });
  surface.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
    view.x = drag.tx + e.clientX - drag.x;
    view.y = drag.ty + e.clientY - drag.y;
    apply();
  });
  function endDrag(event) {
    const moved = drag?.moved;
    suppressBlankClick = Boolean(moved || event.type === 'pointercancel');
    if (drag && surface.hasPointerCapture(drag.id)) surface.releasePointerCapture(drag.id);
    drag = null;
    surface.classList.remove('dragging');
    if (moved && selected && !detail.hidden)
      select(selected, { focus: false, animatePanel: false });
  }
  surface.addEventListener('pointerup', endDrag);
  surface.addEventListener('pointercancel', endDrag);
  surface.addEventListener('click', (e) => {
    if (e.target.closest('.org-node')) return;
    e.stopPropagation();
    if (suppressBlankClick) {
      suppressBlankClick = false;
      return;
    }
    if (selected) {
      close();
      onClose();
    }
  });
  surface.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = surface.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoom(Math.exp(-e.deltaY * 0.003), e.clientX - r.left, e.clientY - r.top);
      else {
        cancel();
        view.x -= e.deltaX;
        view.y -= e.deltaY;
        apply();
      }
    },
    { passive: false },
  );
  surface.addEventListener('keydown', (e) => {
    if (e.target !== surface) return;
    const dx = e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0,
      dy = e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0;
    if (dx || dy) {
      cancel();
      view.x += dx;
      view.y += dy;
      apply();
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') {
      zoom(1.15);
      e.preventDefault();
    } else if (e.key === '-') {
      zoom(1 / 1.15);
      e.preventDefault();
    }
  });
  container.querySelectorAll('[data-action]').forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.action;
        if (a === 'in') zoom(1.15);
        else if (a === 'out') zoom(1 / 1.15);
        else if (a === 'fit') fit();
        else if (a === 'locate' && selected) select(selected);
        else if (a === 'flight') {
          flights = !flights;
          b.setAttribute('aria-pressed', String(flights));
          b.textContent = flights ? '飞线开启' : '飞线暂停';
          highlight();
        }
      }),
  );
  const observer = new ResizeObserver(() => {
    if (disposed || !initialized) return;
    if (selected && !detail.hidden && !drag)
      select(selected, { focus: false, animatePanel: false });
  });
  observer.observe(surface);
  const unsubscribe = motion.onChange(() => {
    sample();
    highlight();
    if (selected && !drag) select(selected, { focus: false, animatePanel: false });
  });
  function visibility() {
    if (document.hidden) cancel();
    highlight();
  }
  document.addEventListener('visibilitychange', visibility);
  apply();
  const api = {
    select,
    close,
    hasSelection: () => Boolean(selected),
    setOnline(value) {
      online = value;
      highlight();
    },
    update(agents, tasks = []) {
      lastAgents = agents;
      lastTasks = tasks;
      const active = document.activeElement,
        focused = active?.dataset?.orgNode || active?.dataset?.agent,
        signature = JSON.stringify([agents, tasks, graphMode]);
      if (nodeLayer.dataset.signature === signature) return;
      graph = graphMode === 'dag' ? layoutDag(tasks, agents) : layoutOrg(agents);
      container.querySelector('.org-legend').textContent =
        (graphMode === 'dag'
          ? agents.length +
            ' 个真实 Agent · ' +
            tasks.reduce((sum, t) => sum + executionRecords(t).length, 0) +
            ' 条执行 · ' +
            tasks.length +
            ' 个工单 · 实线：任务依赖 · 虚线：执行归属'
          : '所有真实 Agent · 连线依据已报告的原生父子关系') +
        (graph.warnings?.length ? ' · ' + graph.warnings.join('；') : '');
      svg.setAttribute('width', graph.width);
      svg.setAttribute('height', graph.height);
      nodeLayer.innerHTML = graph.nodes
        .map(
          (n) => html`
            <div
              class="org-node ${n.unknown ? 'unlinked-node' : ''}"
              data-id="${safe(orgId(n))}"
              style="transform:translate(${n.x}px,${n.y}px);width:${n.width}px;height:${n.height}px"
            >
              ${n.task ? renderDagCard(n) : card(n)}${
                n.unknown
                  ? html`
                      <span class="unknown-relation">关系未提供 / 异常</span>
                    `
                  : ''
              }
            </div>
          `,
        )
        .join('');
      // 字体、长名称和宿主缩放都会影响内容高度，以真实 DOM 测量修正几何。
      const measured = new Map(
        [...nodeLayer.children].map((el) => [
          el.dataset.id,
          Math.max(el.offsetHeight, el.querySelector('.agent-card').scrollHeight + 4),
        ]),
      );
      graph =
        graphMode === 'dag' ? layoutDag(tasks, agents, measured) : layoutOrg(agents, measured);
      for (const el of nodeLayer.children) {
        const node = graph.nodes.find((n) => orgId(n) === el.dataset.id);
        el.style.transform = 'translate(' + node.x + 'px,' + node.y + 'px)';
        el.style.height = node.height + 'px';
      }
      svg.setAttribute('width', graph.width);
      svg.setAttribute('height', graph.height);
      nodeLayer.dataset.signature = signature;
      nodeLayer
        .querySelectorAll('[data-agent]')
        .forEach((b) => (b.onclick = () => select(b.dataset.orgNode || b.dataset.agent)));
      if (selected && !graph.nodes.some((n) => orgId(n) === selected)) {
        close();
        onClose();
      }
      highlight();
      if (!initialized) {
        initialized = true;
        fit();
      } else if (selected && !drag) {
        const pending = detail.hidden;
        select(selected, { focus: pending, animatePanel: pending });
      }
      if (focused)
        nodeLayer
          .querySelector(
            '[data-org-node="' +
              CSS.escape(focused) +
              '"], [data-agent="' +
              CSS.escape(focused) +
              '"]',
          )
          ?.focus({ preventScroll: true });
    },
    destroy() {
      cancel();
      disposed = true;
      observer.disconnect();
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      if (drag && surface.hasPointerCapture(drag.id)) surface.releasePointerCapture(drag.id);
      container.classList.remove('canvas-content');
      layoutBox.classList.remove('org-layout', 'detail-bottom', 'detail-standalone');
    },
  };
  container.querySelector('.org-mode').onchange = (event) => {
    graphMode = event.target.value;
    close();
    onClose();
    initialized = false;
    api.update(lastAgents, lastTasks);
  };
  return api;
}
