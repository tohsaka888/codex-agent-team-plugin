import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { homedir, hostname } from 'node:os';
import { samePath } from './native-state.mjs';

// 宿主内部存储的只读兼容适配；不读取提示、凭据或工具参数。
export async function readHostCatalog(
  home = process.env.CODEX_HOME || resolve(homedir(), '.codex'),
) {
  const titles = new Map();
  try {
    for (const line of (await readFile(resolve(home, 'session_index.jsonl'), 'utf8')).split('\n')) {
      try {
        const s = JSON.parse(line);
        if (s.id && s.thread_name) titles.set(s.id, s.thread_name);
      } catch {}
    }
  } catch {}
  let db;
  try {
    const files = (await readdir(home))
      .filter((n) => /^state_\d+\.sqlite$/.test(n))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
    if (!files.length) return { projects: [], threads: [], warning: null };
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(resolve(home, files[0]), { readOnly: true });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(threads)')
        .all()
        .map((c) => c.name),
    );
    const optional = (n) => (columns.has(n) ? n : `NULL AS ${n}`);
    const rows = db
      .prepare(
        `SELECT id,cwd,source,updated_at,${['name', 'updated_at_ms', 'recency_at_ms', 'agent_role', 'agent_path', 'agent_nickname', 'rollout_path'].map(optional).join(',')} FROM threads WHERE archived=0`,
      )
      .all();
    const parents = new Map();
    try {
      for (const e of db
        .prepare('SELECT parent_thread_id,child_thread_id FROM thread_spawn_edges')
        .all())
        parents.set(e.child_thread_id, e.parent_thread_id);
    } catch {}
    const threads = rows
      .filter(
        (r) => typeof r.cwd === 'string' && Number.isFinite(r.updated_at_ms || r.updated_at * 1000),
      )
      .map((r) => {
        let spawn;
        try {
          spawn = JSON.parse(r.source)?.subagent?.thread_spawn;
        } catch {}
        const title = r.name || titles.get(r.id) || null;
        return {
          id: r.id,
          cwd: r.cwd,
          title: title || null,
          parentSessionId: parents.get(r.id) || spawn?.parent_thread_id || null,
          nativeRole: r.agent_role || null,
          agentName: r.agent_path || spawn?.agent_path || r.agent_nickname || null,
          rolloutPath: r.rollout_path || null,
          lastActivityAt: new Date(
            Math.max(r.updated_at_ms || r.updated_at * 1000, r.recency_at_ms || 0),
          ).toISOString(),
          source: 'codex-host/sqlite',
        };
      });
    const hostName =
      process.env.AGENT_TEAM_HOST_NAME || (process.platform === 'win32' ? '本机' : hostname());
    const projects = [];
    const add = (id, name, path, updatedAt, source) => {
      if (projects.some((p) => samePath(p.path, path))) return;
      projects.push({
        id: JSON.stringify(['local', id]),
        projectId: id,
        hostId: 'local',
        hostName,
        kind: 'local',
        name,
        path,
        updatedAt,
        source,
        connectionStatus: 'unknown',
      });
    };
    try {
      for (const p of db
        .prepare(
          'SELECT p.id,p.name,r.path,p.updated_at_ms FROM projects p JOIN project_roots r ON p.id=r.project_id ORDER BY r.position',
        )
        .all())
        add(
          p.id,
          p.name,
          p.path,
          new Date(p.updated_at_ms).toISOString(),
          '宿主项目数据库（兼容适配）',
        );
    } catch {}
    // 远程 App Server 未保存桌面项目注册表时，以真实主会话 cwd 补齐。
    for (const t of threads.filter((t) => !t.parentSessionId)) {
      try {
        if ((await stat(t.cwd)).isDirectory())
          add(t.cwd, basename(t.cwd) || t.cwd, t.cwd, null, '宿主会话工作区（兼容适配）');
      } catch {}
    }
    return { projects, threads, warning: null };
  } catch {
    return { projects: [], threads: [], warning: '宿主会话目录不可用；仅展示已接入的事件。' };
  } finally {
    db?.close();
  }
}
