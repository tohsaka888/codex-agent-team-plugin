import { realpath, stat, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { readState } from './readonly-state.mjs';
import { executionDocument } from './execution-document.mjs';
// 只读取本会话已关联产物；既校验词法路径，也校验符号链接后的真实路径。
function within(root, path) {
  const rel = relative(root, path);
  return (
    rel !== '' &&
    !isAbsolute(rel) &&
    rel !== '..' &&
    !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
  );
}
export async function readArtifact({ projectId, rootSessionId, taskId, reference, ...context }) {
  if (!rootSessionId || !taskId || !reference) throw new Error('缺少已关联的任务产物');
  const state = await readState({ projectId, rootSessionId, ...context });
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  const task = state.snapshot.tasks.find((t) => t.id === taskId);
  if (project?.hostId !== 'local' || !task) throw new Error('任务或本机工作区不可用');
  if (reference.startsWith('execution://'))
    return executionDocument({
      state,
      project,
      task,
      id: reference.slice('execution://'.length),
      codexHome: context.codexHome,
    });
  const artifact = task.artifacts?.find((a) => a.reference === reference);
  const review = task.reviewRecords?.find((r) => r.reference === reference);
  const requirement = task.reviewRequirements?.find((r) => r.reference === reference);
  if ((!artifact && !review && !requirement) || artifact?.availability === 'unavailable')
    throw new Error('文件未关联到本任务或已标记不可用');
  const base = await realpath(project.path),
    candidate = resolve(base, reference);
  if (!within(base, candidate)) throw new Error('产物路径超出工作区');
  const path = await realpath(candidate);
  if (!within(base, path)) throw new Error('产物真实路径超出工作区');
  const info = await stat(path);
  if (!info.isFile()) throw new Error('产物不是可预览文件');
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(info.size, 120000));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead),
      binary = bytes.includes(0);
    return {
      path,
      title: artifact?.title || requirement?.title || '评审依据',
      size: info.size,
      binary,
      truncated: bytesRead < info.size,
      content: binary ? null : bytes.toString('utf8'),
      readOnly: true,
    };
  } finally {
    await handle.close();
  }
}
