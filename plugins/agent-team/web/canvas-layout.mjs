import { orgForest, orgId } from './org-view.mjs';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 公开交互接口：可满足时返回最小位移，空间不够则由调用者改用独立详情。
export function revealNode({ node, view, safeRect, minScale = 1 }) {
  const { x, y, width, height } = safeRect;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(Math.max(view.scale, minScale), width / node.width, height / node.height);
  if (scale < minScale) return null;
  return {
    x: clamp(view.x, x - scale * node.x, x + width - scale * (node.x + node.width)),
    y: clamp(view.y, y - scale * node.y, y + height - scale * (node.y + node.height)),
    scale,
  };
}

export function layoutOrg(agents, measured = new Map()) {
  const { roots, unlinked } = orgForest(agents),
    nodes = [],
    edges = [];
  const width = 244,
    height = 210,
    gap = 44,
    level = 280;
  const span = (a) =>
    Math.max(
      1,
      a.children.reduce((sum, c) => sum + span(c), 0),
    );
  function place(a, left, depth, unknown = false) {
    const size = span(a) * (width + gap);
    nodes.push({
      ...a,
      x: left + (size - width) / 2,
      y: 32 + depth * level,
      width,
      height: measured.get(orgId(a)) || height + (a.allRuns?.length || 0) * 90,
      depth,
      unknown,
    });
    let childLeft = left;
    for (const child of a.children) {
      edges.push({ from: orgId(a), to: orgId(child) });
      place(child, childLeft, depth + 1, unknown);
      childLeft += span(child) * (width + gap);
    }
  }
  let left = 24;
  for (const root of roots) {
    place(root, left, 0);
    left += span(root) * (width + gap) + gap;
  }
  for (const root of unlinked) {
    place(root, left, 0, true);
    left += span(root) * (width + gap) + gap;
  }
  const depths = [...new Set(nodes.map((n) => n.depth))].sort((a, b) => a - b);
  const canvasWidth = Math.max(
    300,
    ...depths.map(
      (depth) => nodes.filter((n) => n.depth === depth).length * (width + gap) - gap + 48,
    ),
  );
  let rowY = 32;
  for (const depth of depths) {
    const row = nodes.filter((n) => n.depth === depth);
    const rowWidth = row.length * (width + gap) - gap;
    row.forEach((n, index) => {
      n.x = (canvasWidth - rowWidth) / 2 + index * (width + gap);
      n.y = rowY;
    });
    rowY += Math.max(...row.map((n) => n.height)) + 70;
  }
  return {
    nodes,
    edges,
    width: canvasWidth,
    height: Math.max(220, ...nodes.map((n) => n.y + n.height + 24)),
  };
}
