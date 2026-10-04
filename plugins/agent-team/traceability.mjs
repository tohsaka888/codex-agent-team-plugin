// 展示合同：完成和评审是独立证据，不由执行状态推断。
const text = (value, max = 2000) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
export function acceptanceItems(values) {
  const items = new Map();
  for (const value of (Array.isArray(values) ? values : []).slice(0, 50)) {
    if (!text(value?.id, 100) || !text(value?.label)) continue;
    const evidence = text(value.evidence),
      reportedBy = text(value.reportedBy, 500);
    let status = ['pending', 'passed', 'failed', 'unknown'].includes(value.status)
      ? value.status
      : 'unknown';
    if (['passed', 'failed'].includes(status) && (!evidence || !reportedBy)) status = 'unknown';
    items.set(value.id, {
      id: value.id,
      label: value.label,
      status,
      evidence,
      reportedBy,
      method: text(value.method),
      manualCheck: value.manualCheck
        ? {
            entry: text(value.manualCheck.entry),
            steps: (Array.isArray(value.manualCheck.steps) ? value.manualCheck.steps : [])
              .map((step) => text(step))
              .filter(Boolean),
            expected: text(value.manualCheck.expected),
          }
        : null,
      verifier: ['agent', 'human'].includes(value.verifier) ? value.verifier : null,
      kind: text(value.kind, 100),
      version: text(value.version, 100),
      resultVersion: text(value.resultVersion, 100),
      resultDigest: text(value.resultDigest, 100),
      parentItemId: text(value.parentItemId, 100),
      parentVersion: text(value.parentVersion, 100),
      observedAt: text(value.updatedAt || value.observedAt, 100),
    });
  }
  return [...items.values()];
}
export function reviewRecords(values) {
  const records = new Map();
  for (const value of (Array.isArray(values) ? values : []).slice(0, 100)) {
    if (
      !text(value?.id, 100) ||
      !['agent', 'human'].includes(value.actorType) ||
      !text(value.summary)
    )
      continue;
    const author = text(value.author, 500),
      evidence = text(value.evidence),
      source = text(value.source, 500);
    let decision = ['passed', 'changes_requested', 'confirmed', 'comment'].includes(value.decision)
      ? value.decision
      : 'comment';
    // “通过”必须有署名与依据；人工确认额外保留明确来源。
    const humanSource =
      value.actorType !== 'human' ||
      (['passed', 'confirmed'].includes(decision)
        ? source === 'user-confirmation'
        : ['user-confirmation', 'user-feedback'].includes(source));
    if (!author || !evidence || !humanSource) decision = 'comment';
    records.set(value.id, {
      id: value.id,
      actorType: value.actorType,
      author,
      nativeAgentId: value.actorType === 'agent' ? text(value.nativeAgentId, 500) : null,
      scope: ['design', 'delivery'].includes(value.scope) ? value.scope : 'unspecified',
      decision,
      summary: value.summary,
      evidence,
      source,
      targetId: text(value.targetId, 100),
      targetVersion: text(value.targetVersion, 100),
      targetDigest:
        typeof value.targetDigest === 'string' && /^[a-f\d]{64}$/i.test(value.targetDigest)
          ? value.targetDigest.toLowerCase()
          : null,
      reference: text(value.reference, 2048),
      observedAt: Number.isFinite(Date.parse(value.observedAt))
        ? new Date(value.observedAt).toISOString()
        : null,
    });
  }
  return [...records.values()];
}
export function checklist(task) {
  if (task?.acceptanceItemsReported || task?.acceptanceItems?.length)
    return acceptanceItems(task.acceptanceItems);
  return (typeof task?.acceptance === 'string' ? task.acceptance : '')
    .split(/[；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label, index) => ({
      id: 'legacy-' + index,
      label,
      status: 'unknown',
      evidence: null,
      reportedBy: null,
    }));
}
