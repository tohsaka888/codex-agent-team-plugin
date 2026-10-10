// 自包含同步与只读展示共用；执行结束不等于验收完成。
const nonempty = (value) => typeof value === 'string' && value.trim() && value.length <= 2000;
export function validateContract(entity) {
  const items = entity.acceptanceItems;
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new Error('AC acceptanceItems must contain 1..50 conditions');
  for (const field of ['version', 'role', 'taskType'])
    if (!nonempty(entity[field])) throw new Error(`AC ${field} must be non-empty`);
  if (!['code', 'design', 'documentation', 'analysis'].includes(entity.taskType))
    throw new Error('AC taskType must be code|design|documentation|analysis');
  const ids = new Set();
  for (const item of items) {
    if (
      !item ||
      Object.keys(item).some(
        (key) =>
          ![
            'id',
            'label',
            'method',
            'verifier',
            'kind',
            'parentItemId',
            'parentVersion',
            'manualCheck',
          ].includes(key),
      )
    )
      throw new Error(
        'AC definitions only contain id/label/method/verifier/kind/parentItemId/parentVersion',
      );
    for (const field of ['id', 'label', 'method'])
      if (!nonempty(item[field])) throw new Error(`AC ${field} must be non-empty`);
    if (item.id.length > 100 || ids.has(item.id)) throw new Error('AC duplicate/oversized id');
    ids.add(item.id);
    if (!['agent', 'human'].includes(item.verifier))
      throw new Error('AC verifier must be agent|human');
    if (!['check', 'unit_test', 'prototype', 'delivery'].includes(item.kind))
      throw new Error('AC invalid kind');
    if (['prototype', 'delivery'].includes(item.kind) !== (item.verifier === 'human'))
      throw new Error('AC prototype/delivery require human; check/unit_test require agent');
    if (item.verifier === 'human') {
      const check = item.manualCheck;
      if (
        !check ||
        Object.keys(check).some((key) => !['entry', 'steps', 'expected'].includes(key)) ||
        !nonempty(check.entry) ||
        !nonempty(check.expected) ||
        !Array.isArray(check.steps) ||
        !check.steps.length ||
        check.steps.length > 30 ||
        !check.steps.every(nonempty)
      )
        throw new Error('AC human manualCheck requires concrete entry, steps and expected result');
    } else if (item.manualCheck !== undefined) {
      throw new Error('AC manualCheck is only for human verification');
    }
  }
  if (!items.some((i) => i.verifier === 'agent')) throw new Error('AC requires Agent verification');
  if (entity.taskType === 'code' && !items.some((i) => i.kind === 'unit_test'))
    throw new Error('AC code changes require unit_test');
  if (
    String(entity.role)
      .split('/')
      .some((r) => r.trim().toLowerCase() === 'ue') &&
    !items.some((i) => i.kind === 'prototype')
  )
    throw new Error('AC UE requires human prototype confirmation');
}

export function contractSignature(entity) {
  return JSON.stringify([
    entity.version,
    entity.role,
    entity.taskType,
    entity.goal || null,
    (entity.acceptanceItems || []).map((i) => [
      i.id,
      i.label,
      i.method,
      i.verifier,
      i.kind,
      i.parentItemId || null,
      i.parentVersion || null,
      i.parentAcKey || null,
      i.manualCheck ? [i.manualCheck.entry, i.manualCheck.steps, i.manualCheck.expected] : null,
    ]),
  ]);
}

export function acceptanceState(entity) {
  const definitions = entity?.acceptanceItems || [];
  const missing = !definitions.length || !entity?.acKey;
  const resultReady = Boolean(
    entity?.resultDigest &&
    entity.resultCurrent !== false &&
    entity.parentReferencesCurrent !== false,
  );
  const records = entity?.reviewRecords || [];
  const requirements = entity?.reviewRequirements || [];
  const validReview = (r, q) =>
    r.requirementId === q.id &&
    r.version === q.version &&
    r.digest === q.digest &&
    q.acKey === entity.acKey &&
    r.acKey === entity.acKey &&
    q.fileCurrent !== false &&
    entity.parentReferencesCurrent !== false &&
    r.scopeKey === q.scopeKey &&
    (q.type !== 'delivery' ||
      (q.resultDigest === entity.resultDigest &&
        q.resultVersion === entity.resultVersion &&
        resultReady));
  const items = definitions.map((i) => {
    if (i.verifier === 'human') {
      const types = i.kind === 'prototype' ? ['ui', 'visual'] : ['delivery'];
      const q = requirements
        .filter(
          (q) =>
            q.itemId === i.id &&
            types.includes(q.type) &&
            q.acKey === entity.acKey &&
            q.fileCurrent !== false &&
            (q.type !== 'delivery' ||
              (q.resultDigest === entity.resultDigest && q.resultVersion === entity.resultVersion)),
        )
        .at(-1);
      const decisions = q
        ? records.filter(
            (r) =>
              r.authorType === 'human' &&
              ['approved', 'rejected'].includes(r.decision) &&
              validReview(r, q),
          )
        : [];
      const record = decisions.at(-1);
      return {
        ...i,
        status:
          record?.decision === 'approved'
            ? 'passed'
            : record?.decision === 'rejected'
              ? 'failed'
              : 'pending',
        evidence: record?.quote || null,
        reportedBy: record?.author || null,
        observedAt: record?.updatedAt || null,
        version: entity.version,
        resultVersion: entity.resultVersion || null,
        resultDigest: entity.resultDigest || null,
      };
    }
    const current =
      resultReady &&
      i.acKey === entity.acKey &&
      i.resultDigest === entity.resultDigest &&
      i.resultVersion === entity.resultVersion &&
      i.version === entity.version;
    return {
      ...i,
      status: current ? i.status || 'pending' : 'pending',
      evidence: current ? i.evidence || null : null,
      reportedBy: current ? i.reportedBy || null : null,
    };
  });
  const agents = items.filter((i) => i.verifier === 'agent');
  const human = items.filter((i) => i.verifier === 'human');
  // 最新明确审查决定按归档顺序；评论不覆盖通过或退回。
  const agentReview = records
    .filter(
      (r) =>
        r.authorType === 'agent' &&
        r.scope === 'delivery' &&
        ['approved', 'rejected'].includes(r.decision) &&
        r.acKey === entity.acKey &&
        r.resultDigest === entity.resultDigest &&
        r.resultVersion === entity.resultVersion,
    )
    .at(-1);
  const agentReady =
    !missing && resultReady && agents.length > 0 && agents.every((i) => i.status === 'passed');
  const humanReady = !missing && human.every((i) => i.status === 'passed');
  const reviewReady = agentReview?.decision === 'approved';
  return {
    missing,
    items,
    resultReady,
    agentReady,
    humanReady,
    reviewReady,
    accepted: agentReady && humanReady && reviewReady,
    agentPassed: agents.filter((i) => i.status === 'passed').length,
    agentTotal: agents.length,
    humanStatus: !human.length
      ? 'not_required'
      : human.some((i) => i.status === 'failed')
        ? 'rejected'
        : humanReady
          ? 'accepted'
          : 'pending',
  };
}
