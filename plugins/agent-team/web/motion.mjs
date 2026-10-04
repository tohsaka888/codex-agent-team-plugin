import { taskColumn } from './view-model.mjs';

// 所有动画共享减少动效与取消入口；不改变任务数据。
export function createMotion() {
  const media = matchMedia('(prefers-reduced-motion: reduce)'),
    animations = new Set(),
    listeners = new Set();
  let manual = false;
  const reduced = () => manual || media.matches;
  const cancel = () => {
    for (const a of animations) a.cancel();
    animations.clear();
  };
  function changed() {
    cancel();
    document.documentElement.classList.toggle('reduce-motion', reduced());
    for (const f of listeners) f(reduced());
  }
  media.addEventListener('change', changed);
  changed();
  return {
    reduced,
    cancel,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    toggle() {
      manual = !manual;
      changed();
    },
    animate(element, frames, options) {
      if (reduced() || document.hidden || !element.animate) return null;
      const a = element.animate(frames, options);
      animations.add(a);
      a.finished.then(
        () => animations.delete(a),
        () => animations.delete(a),
      );
      return a;
    },
  };
}

export function changedTasks(previous, next) {
  if (
    !previous ||
    !next ||
    previous.selectedProjectId !== next.selectedProjectId ||
    previous.selectedRootSessionId !== next.selectedRootSessionId
  )
    return [];
  const old = new Map(previous.snapshot.tasks.map((t) => [t.id, t]));
  return next.snapshot.tasks
    .filter((t) => {
      const p = old.get(t.id);
      return p && (p.executionStatus !== t.executionStatus || p.reviewPhase !== t.reviewPhase);
    })
    .map((t) => ({ id: t.id, from: taskColumn(old.get(t.id)), to: taskColumn(t) }));
}

export function cardVisible(rect, clip, column = clip) {
  return (
    rect.left >= Math.max(clip.left, column.left) &&
    rect.right <= Math.min(clip.right, column.right) &&
    rect.top >= Math.max(clip.top, column.top) &&
    rect.bottom <= Math.min(clip.bottom, column.bottom)
  );
}
export function captureCards(container) {
  const result = new Map(),
    clip = container.getBoundingClientRect();
  for (const element of container.querySelectorAll('[data-task]')) {
    const rect = element.getBoundingClientRect();
    if (cardVisible(rect, clip, element.closest('.column-body')?.getBoundingClientRect()))
      result.set(element.dataset.task, { rect });
  }
  return result;
}

export function animateCards(container, previous, changes, motion, announce) {
  const clip = container.getBoundingClientRect();
  for (const [index, change] of changes.entries()) {
    const element = container.querySelector('[data-task="' + CSS.escape(change.id) + '"]');
    if (!element) continue;
    element.classList.add('status-changed');
    const old = previous.get(change.id),
      next = element.getBoundingClientRect();
    if (
      change.from === change.to ||
      !old ||
      !cardVisible(next, clip, element.closest('.column-body')?.getBoundingClientRect())
    )
      continue;
    // 原卡片立即成为新状态；可见副本仅解释位移，不能接收点击或键盘焦点。
    const ghost = element.cloneNode(true);
    ghost.classList.add('motion-ghost');
    ghost.removeAttribute('data-task');
    ghost.removeAttribute('aria-pressed');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.cssText =
      'position:fixed;left:' +
      next.left +
      'px;top:' +
      next.top +
      'px;width:' +
      next.width +
      'px;height:' +
      next.height +
      'px;margin:0;';
    if (motion.reduced() || document.hidden) continue;
    document.body.append(ghost);
    element.style.opacity = '0';
    const animation = motion.animate(
      ghost,
      [
        {
          transform:
            'translate(' +
            (old.rect.left - next.left) +
            'px,' +
            (old.rect.top - next.top) +
            'px) scale(' +
            old.rect.width / next.width +
            ',' +
            old.rect.height / next.height +
            ')',
        },
        { transform: 'translate(0) scale(1)' },
      ],
      {
        duration: 380,
        delay: Math.min(index * 24, 120),
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      },
    );
    if (animation)
      animation.finished
        .catch(() => {})
        .finally(() => {
          ghost.remove();
          element.style.opacity = '';
        });
    else {
      ghost.remove();
      element.style.opacity = '';
    }
  }
  if (changes.length) announce(changes.length + ' 项任务状态已更新；只显示收到的新状态。');
}
