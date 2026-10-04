// 只读查询边界：最新 Workspace、串行请求及缓存归属，不控制原生任务。
function matchesProject(snapshot, projectId) {
  if (!snapshot) return false;
  if (snapshot.selectedProjectId === projectId) return true;
  // 后端兼容原始本机 projectId，响应统一返回包含 hostId 的规范 id。
  // 只采用响应清单中的明确映射；远程项目必须使用包含主机的完整 id。
  const projects = snapshot.projects || [];
  if (projects.some((p) => p.id === projectId)) return false;
  const matches = projects.filter((p) => p.hostId === 'local' && p.projectId === projectId);
  return matches.length === 1 && matches[0].id === snapshot.selectedProjectId;
}
export function createSnapshotReader({
  query,
  onSnapshot,
  onError,
  onBusy = () => {},
  isVisible = () => true,
  isReady = () => true,
}) {
  let projectId,
    rootSessionId,
    version = 0,
    pending = null,
    queued = false,
    lastSnapshot = null;
  function request() {
    if (!isReady() || !isVisible()) return Promise.resolve();
    if (pending) {
      queued = true;
      return pending;
    }
    pending = (async () => {
      onBusy(true);
      do {
        queued = false;
        const token = version,
          scope = projectId,
          session = rootSessionId;
        try {
          const next = await Promise.resolve().then(() => query(scope, session));
          if (token !== version) {
            queued = true;
            continue;
          }
          if (scope && !matchesProject(next, scope)) throw new Error('Workspace 响应归属不匹配');
          if (session && next.selectedRootSessionId !== session)
            throw new Error('会话响应归属不匹配');
          lastSnapshot = next;
          projectId = next.selectedProjectId;
          rootSessionId = next.selectedRootSessionId || undefined;
          onSnapshot(next);
        } catch (error) {
          if (token !== version) {
            queued = true;
            continue;
          }
          onError(error, {
            projectId: scope,
            rootSessionId: session,
            snapshot:
              matchesProject(lastSnapshot, scope) &&
              (lastSnapshot?.selectedRootSessionId || undefined) === session
                ? lastSnapshot
                : null,
          });
        }
      } while (queued && isVisible() && isReady());
    })().finally(() => {
      pending = null;
      onBusy(false);
    });
    return pending;
  }
  return {
    request,
    select(value, session) {
      projectId = value;
      rootSessionId = session;
      version++;
      return request();
    },
  };
}
