import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// 本机兼容适配器：宿主保存项目的内部格式，不是稳定的公开 API。
export function remoteWorkspaces(state) {
  const hosts = new Map(
    (Array.isArray(state['codex-managed-remote-connections'])
      ? state['codex-managed-remote-connections']
      : []
    )
      .filter((h) => h && typeof h.hostId === 'string')
      .map((h) => [h.hostId, h.displayName || h.alias || h.hostId]),
  );
  const seen = new Set();
  return (Array.isArray(state['remote-projects']) ? state['remote-projects'] : []).flatMap((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      typeof p.hostId !== 'string' ||
      typeof p.remotePath !== 'string'
    )
      return [];
    const id = JSON.stringify([p.hostId, p.id]);
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        projectId: p.id,
        name: p.label || p.remotePath,
        hostId: p.hostId,
        hostName: hosts.get(p.hostId) || p.hostId,
        kind: 'remote',
        path: p.remotePath,
        source: '宿主已保存远程项目',
        connectionStatus: 'unknown',
      },
    ];
  });
}

export async function readRemoteWorkspaces() {
  try {
    const path = resolve(
      process.env.CODEX_HOME || resolve(homedir(), '.codex'),
      '.codex-global-state.json',
    );
    return { projects: remoteWorkspaces(JSON.parse(await readFile(path, 'utf8'))), warning: null };
  } catch {
    return { projects: [], warning: '远程项目清单不可用；当前仅显示本机项目。' };
  }
}
