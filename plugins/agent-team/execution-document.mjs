import { readdir, realpath, mkdir, writeFile, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { samePath } from './native-state.mjs';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
async function locate(base, id, depth = 0) {
  if (depth > 4) return null;
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  for (const e of entries)
    if (e.isFile() && e.name.endsWith('-' + id + '.jsonl')) return resolve(base, e.name);
  for (const e of entries)
    if (e.isDirectory()) {
      const path = await locate(resolve(base, e.name), id, depth + 1);
      if (path) return path;
    }
  return null;
}
function within(base, path) {
  const rel = relative(base, path);
  return (
    rel !== '' &&
    !isAbsolute(rel) &&
    rel !== '..' &&
    !rel.startsWith('..\\') &&
    !rel.startsWith('../')
  );
}
export async function executionDocument({ state, project, task, id, codexHome }) {
  if (!uuid.test(id || '') || !state.snapshot.agents.some((a) => a.nativeAgentId === id))
    throw new Error('执行实例未关联当前团队');
  const home = codexHome || process.env.CODEX_HOME || resolve(homedir(), '.codex');
  let path, base;
  for (const dir of ['sessions', 'archived_sessions']) {
    base = resolve(home, dir);
    path = await locate(base, id);
    if (path) break;
  }
  if (!path) throw new Error('本机执行记录未保存或已移除');
  const canonical = await realpath(path);
  if (!within(await realpath(base), canonical)) throw new Error('执行记录真实路径越界');
  // 先核对头部身份，再从文件尾读取；大日志也只载入最近 4 MB。
  const handle = await open(canonical, 'r');
  let header, tail, truncated;
  try {
    const size = (await handle.stat()).size;
    const head = Buffer.alloc(Math.min(size, 65536));
    await handle.read(head, 0, head.length, 0);
    header = JSON.parse(head.toString('utf8').split('\n')[0]);
    const start = Math.max(0, size - 4 * 1024 * 1024),
      buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    tail = buffer.toString('utf8');
    truncated = start > 0;
    if (start > 0) tail = tail.slice(tail.indexOf('\n') + 1);
  } finally {
    await handle.close();
  }
  if (
    header.type !== 'session_meta' ||
    header.payload?.id !== id ||
    !samePath(header.payload?.cwd, project.path)
  )
    throw new Error('执行记录身份或工作区不匹配');
  const entries = [];
  const add = (label, content, at) => {
    if (!content) return;
    entries.push({ label, content: String(content).slice(0, 16000), at: at || '未知' });
    if (entries.length > 200) {
      entries.shift();
      truncated = true;
    }
  };
  for (const line of tail.split('\n')) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const p = row.payload || {};
    if (row.type === 'response_item') {
      if (
        p.type === 'message' &&
        ['user', 'assistant'].includes(p.role) &&
        p.channel !== 'analysis'
      )
        add(
          p.role === 'user' ? '用户消息' : 'Agent 回复',
          (p.content || [])
            .filter((c) => ['input_text', 'output_text'].includes(c.type))
            .map((c) => c.text || '')
            .join('\n'),
          row.timestamp,
        );
      else if (['function_call', 'custom_tool_call'].includes(p.type))
        add('工具调用 · ' + (p.name || '未知'), p.arguments || p.input, row.timestamp);
      else if (['function_call_output', 'custom_tool_call_output'].includes(p.type))
        add(
          '工具结果',
          typeof p.output === 'string' ? p.output : JSON.stringify(p.output),
          row.timestamp,
        );
    } else if (
      row.type === 'event_msg' &&
      ['task_started', 'task_complete', 'turn_aborted'].includes(p.type)
    )
      add('执行事件', p.last_agent_message || p.reason || p.type, row.timestamp);
  }
  const title = '详细执行记录 · ' + task.title;
  const content =
    '# ' +
    title.replace(/[\r\n]/g, ' ') +
    '\n\n实例：`' +
    id +
    '`\n\n生成时间：' +
    new Date().toISOString() +
    '\n\n本机已保存记录的只读快照，最多最近 200 项；单项最多 16000 字符。不含内部推理。' +
    (truncated ? '\n\n记录较大，前面的内容已省略。' : '') +
    '\n\n' +
    (entries.length
      ? entries
          .map(
            (e) =>
              '## ' +
              e.label.replace(/[\r\n]/g, ' ') +
              '\n\n时间：' +
              e.at +
              '\n\n' +
              e.content
                .split('\n')
                .map((line) => '    ' + line)
                .join('\n'),
          )
          .join('\n\n')
      : '暂无可展示的消息或工具调用。');
  const root = await realpath(project.path),
    dir = resolve(root, '.runtime/native-team/execution-documents');
  await mkdir(dir, { recursive: true });
  const target = resolve(dir, id + '.md');
  if (!within(root, await realpath(dir))) throw new Error('执行记录缓存目录越界');
  try {
    if (!within(root, await realpath(target))) throw new Error('执行记录缓存文件越界');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(target, content, 'utf8');
  return {
    path: target,
    title,
    size: Buffer.byteLength(content),
    content,
    binary: false,
    truncated,
    readOnly: true,
  };
}
