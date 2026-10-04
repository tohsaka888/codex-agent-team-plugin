import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { samePath } from './native-state.mjs';

const cache = new Map();
const stamp = (x) => (Number.isFinite(Date.parse(x)) ? new Date(x).toISOString() : null);
// 宿主可将 message 保存为 Fernet 格式密文；它不是可展示的任务正文。
const isEncryptedText = (value) =>
  typeof value === 'string' && /^gAAAAA[A-Za-z0-9_-]{90,}={0,2}$/.test(value.trim());
const excerpt = (value, max = 2000) =>
  typeof value === 'string' && !isEncryptedText(value) ? value.trim().slice(0, max) || null : null;
function itemActivity(item) {
  if (item.type === 'AgentMessage' && ['commentary', 'final_answer', 'final'].includes(item.phase))
    return excerpt(
      (item.content || [])
        .filter((c) => c.type === 'Text')
        .map((c) => c.text)
        .join('\n'),
    );
  const labels = {
    CommandExecution: '执行命令',
    FileChange: '修改文件',
    SubAgentActivity: '子 Agent 协作',
    Extension: '调用扩展工具',
    McpToolCall: '调用 MCP 工具',
    WebSearch: '搜索网页',
  };
  if (!labels[item.type]) return null;
  const status = {
    completed: '已完成',
    failed: '失败',
    inProgress: '进行中',
    in_progress: '进行中',
  };
  return labels[item.type] + (item.status ? ' · ' + (status[item.status] || '已观察') : '');
}
// 按用户要求投影所选团队的分派目标和公开活动；不返回思考、工具参数及输出。
export async function readActivity(home, thread) {
  try {
    if (!thread.rolloutPath) return null;
    const base = await realpath(home),
      path = await realpath(thread.rolloutPath),
      inside = relative(base, path);
    if (
      isAbsolute(inside) ||
      inside === '..' ||
      inside.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
      !/^sessions[\\/]/.test(inside)
    )
      return null;
    const info = await stat(path),
      key = path + '\0' + thread.id;
    if (info.size > 64 * 1024 * 1024) return null;
    const signature = info.size + ':' + info.mtimeMs;
    if (cache.get(key)?.signature === signature) return cache.get(key).value;
    const owned = new Set(),
      turns = new Map(),
      calls = new Map(),
      dispatches = [];
    let current = null,
      verified = false;
    const stream = createReadStream(path, { encoding: 'utf8' }),
      lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        let r;
        try {
          r = JSON.parse(line);
        } catch {
          continue;
        }
        const p = r.payload || {},
          at = stamp(r.timestamp);
        if (r.type === 'session_meta' && p.id === thread.id) verified = true;
        if (!verified) continue;
        // Fork 中复制的父回合不能作为子 Agent 的执行证据。
        if (
          (r.type === 'token_usage_record' ||
            (r.type === 'event_msg' && p.type === 'item_completed')) &&
          p.thread_id === thread.id &&
          p.turn_id
        )
          owned.add(p.turn_id);
        if (r.type === 'event_msg' && p.type === 'task_started' && p.turn_id && at) {
          current = p.turn_id;
          if (thread.parentSessionId && p.root_turn_id && p.root_turn_id !== p.turn_id)
            owned.add(p.turn_id);
          turns.set(p.turn_id, { turnId: p.turn_id, status: 'running', at });
        }
        if (
          r.type === 'event_msg' &&
          ['task_complete', 'turn_aborted'].includes(p.type) &&
          p.turn_id &&
          at
        ) {
          const old = turns.get(p.turn_id);
          if (old)
            turns.set(p.turn_id, {
              ...old,
              status: p.type === 'turn_aborted' ? 'interrupted' : p.error ? 'failed' : 'completed',
              at,
            });
        }
        if (
          r.type === 'event_msg' &&
          p.type === 'item_completed' &&
          p.thread_id === thread.id &&
          at
        ) {
          const turn = turns.get(p.turn_id),
            summary = itemActivity(p.item || {});
          if (turn && summary) {
            turn.activitySummary = summary;
            turn.activityAt = at;
          }
        }
        if (
          r.type === 'response_item' &&
          ['function_call', 'custom_tool_call'].includes(p.type) &&
          at
        ) {
          const turn = turns.get(p.internal_chat_message_metadata_passthrough?.turn_id || current);
          if (turn) {
            turn.activitySummary =
              '调用工具 · ' + excerpt([p.namespace, p.name].filter(Boolean).join('.'), 160);
            turn.activityAt = at;
          }
        }
        if (
          r.type === 'response_item' &&
          p.type === 'function_call' &&
          /^(?:(?:collaboration|functions)\.)?spawn_agent$/.test(p.name) &&
          (!p.namespace || ['collaboration', 'functions'].includes(p.namespace))
        ) {
          try {
            const args = JSON.parse(p.arguments);
            calls.set(p.call_id, {
              turnId: current,
              role: typeof args.agent_type === 'string' ? args.agent_type : null,
              goal: excerpt(args.message, 6000),
              goalUnavailableReason: isEncryptedText(args.message) ? 'encrypted' : null,
            });
          } catch {}
        }
        if (
          r.type === 'response_item' &&
          p.type === 'function_call_output' &&
          calls.has(p.call_id)
        ) {
          try {
            const out = typeof p.output === 'string' ? JSON.parse(p.output) : p.output;
            const agentPath = excerpt(out?.task_name, 500),
              agentId = excerpt(out?.agent_id, 100);
            if ((agentPath || agentId) && !out.error)
              dispatches.push({ ...calls.get(p.call_id), agentPath, agentId, at });
          } catch {}
        }
      }
    } finally {
      lines.close();
      stream.destroy();
    }
    const latest = [...turns.values()].filter((t) => owned.has(t.turnId)).at(-1) || null;
    const value = { latest, dispatches: dispatches.filter((d) => owned.has(d.turnId)) };
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { signature, value });
    return value;
  } catch {
    return null;
  }
}

export async function hydrateActivity(home, threads, workspace, rootSessionId) {
  if (!rootSessionId) return threads;
  const ids = new Set(
    threads
      .filter((t) => t.id === rootSessionId && samePath(t.cwd, workspace.path, workspace.hostId))
      .map((t) => t.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of threads)
      if (ids.has(t.parentSessionId) && !ids.has(t.id)) {
        ids.add(t.id);
        changed = true;
      }
  }
  const activity = new Map();
  for (const t of threads) if (ids.has(t.id)) activity.set(t.id, await readActivity(home, t));
  return threads.map((t) => {
    if (!ids.has(t.id)) return t;
    const own = activity.get(t.id),
      dispatch = activity
        .get(t.parentSessionId)
        ?.dispatches.filter((d) =>
          d.agentId ? d.agentId === t.id : Boolean(t.agentName && d.agentPath === t.agentName),
        )
        .at(-1);
    return { ...t, execution: own?.latest || null, dispatch: dispatch || null };
  });
}
