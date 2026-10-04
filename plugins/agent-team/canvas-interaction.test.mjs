import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealNode, layoutOrg } from './web/canvas-layout.mjs';
import { changedTasks, cardVisible } from './web/motion.mjs';

test('列滚动裁剪的卡片不播放跨列位移动画', () => {
  const main = { left: 0, right: 800, top: 0, bottom: 600 },
    column = { left: 200, right: 400, top: 80, bottom: 550 };
  assert.equal(cardVisible({ left: 210, right: 390, top: 60, bottom: 160 }, main, column), false);
  assert.equal(cardVisible({ left: 210, right: 390, top: 500, bottom: 590 }, main, column), false);
  assert.equal(cardVisible({ left: 210, right: 390, top: 90, bottom: 190 }, main, column), true);
  assert.equal(cardVisible({ left: 10, right: 190, top: 20, bottom: 60 }, main), true);
});

test('右侧角色先最小平移进入未来详情的安全区域', () => {
  const target = revealNode({
    node: { x: 970, y: 100, width: 230, height: 150 },
    view: { x: 0, y: 0, scale: 1 },
    safeRect: { x: 24, y: 24, width: 768, height: 552 },
  });
  assert.deepEqual(target, { x: -408, y: 0, scale: 1 });
});
test('已在安全区域的节点不平移，空间不足返回独立详情信号', () => {
  const node = { x: 100, y: 100, width: 244, height: 170 },
    view = { x: 0, y: 0, scale: 1 };
  assert.deepEqual(
    revealNode({ node, view, safeRect: { x: 24, y: 24, width: 768, height: 552 } }),
    view,
  );
  assert.equal(
    revealNode({ node, view, safeRect: { x: 24, y: 24, width: 550, height: 30 } }),
    null,
  );
});
test('选中大图总览的小节点恢复可读比例，并保留未知分支的真实子边', () => {
  assert.equal(
    revealNode({
      node: { x: 100, y: 100, width: 244, height: 170 },
      view: { x: 24, y: 24, scale: 0.2 },
      safeRect: { x: 24, y: 24, width: 500, height: 400 },
    }).scale,
    1,
  );
  const graph = layoutOrg([
    { nativeAgentId: 'missing-root', parentSessionId: 'absent' },
    { nativeAgentId: 'child', parentAgentId: 'missing-root' },
  ]);
  assert.deepEqual(graph.edges, [{ from: 'missing-root', to: 'child' }]);
  assert.ok(graph.nodes.every((n) => n.unknown));
});
test('只有同会话真实状态变化产生迁移，直接完成不补造中间状态', () => {
  const snap = (status) => ({
    selectedProjectId: 'p',
    selectedRootSessionId: 'session',
    snapshot: { tasks: [{ id: 'task', executionStatus: status, reviewPhase: 'unknown' }] },
  });
  assert.deepEqual(changedTasks(snap('queued'), snap('completed')), [
    { id: 'task', from: 'queued', to: 'completed' },
  ]);
  assert.deepEqual(changedTasks(snap('queued'), snap('queued')), []);
  assert.deepEqual(
    changedTasks(snap('queued'), { ...snap('completed'), selectedRootSessionId: 'other' }),
    [],
  );
  assert.deepEqual(changedTasks(null, snap('completed')), []);
});
