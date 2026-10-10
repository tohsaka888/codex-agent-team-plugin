export function sessionUrl(nativeAgentId, hostId = 'local', provider = 'codex') {
  if (
    provider !== 'codex' ||
    hostId !== 'local' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(nativeAgentId || '')
  )
    return null;
  return 'codex://threads/' + encodeURIComponent(nativeAgentId);
}
