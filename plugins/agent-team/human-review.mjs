// 仅投影协调者回报的证据；不决定或拦截原生执行权限。
import { reviewRecords } from './traceability.mjs';
const text = (value, max = 2000) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const digest = (value) =>
  typeof value === 'string' && /^[a-f\d]{64}$/i.test(value) ? value.toLowerCase() : null;
export function reviewRequirements(values) {
  return (Array.isArray(values) ? values : []).slice(0, 40).map((value, index) => ({
    id: text(value?.id, 100) || 'unknown-' + index,
    kind: ['spec', 'adr', 'ui', 'tickets', 'delivery'].includes(value?.kind)
      ? value.kind
      : 'unknown',
    title: text(value?.title) || '评审对象信息缺失',
    reference: text(value?.reference, 2048),
    version: text(value?.version, 100),
    digest: digest(value?.digest),
    applicability: ['required', 'not_applicable'].includes(value?.applicability)
      ? value.applicability
      : 'unknown',
    reason: text(value?.reason),
    reportedBy: text(value?.reportedBy, 500),
    affectedTaskIds: [
      ...new Set(
        (Array.isArray(value?.affectedTaskIds) ? value.affectedTaskIds : []).filter((id) =>
          text(id, 500),
        ),
      ),
    ].slice(0, 40),
  }));
}
export function humanReview(task) {
  const requirements = reviewRequirements(task?.reviewRequirements),
    records = reviewRecords(task?.reviewRecords);
  const items = requirements.map((item) => {
    const matching = records.filter(
      (r) =>
        r.actorType === 'human' &&
        ['confirmed', 'passed', 'changes_requested'].includes(r.decision) &&
        r.targetId === item.id &&
        r.targetVersion === item.version &&
        r.targetDigest === item.digest &&
        r.scope === (item.kind === 'delivery' ? 'delivery' : 'design'),
    );
    const confirmation = matching.at(-1) || null;
    const historical = records.filter(
      (r) =>
        r.actorType === 'human' &&
        r.targetId === item.id &&
        r.scope === (item.kind === 'delivery' ? 'delivery' : 'design') &&
        ['confirmed', 'passed'].includes(r.decision) &&
        r.targetVersion &&
        r.targetDigest &&
        (r.targetVersion !== item.version || r.targetDigest !== item.digest),
    );
    let status = 'awaiting_confirmation';
    if (item.applicability === 'not_applicable')
      status = item.reason && item.reportedBy ? 'not_applicable' : 'unknown';
    else if (
      item.applicability !== 'required' ||
      item.kind === 'unknown' ||
      !item.version ||
      !item.digest ||
      !item.reference
    )
      status = 'unknown';
    else if (confirmation && ['confirmed', 'passed'].includes(confirmation.decision))
      status = 'confirmed';
    else if (confirmation?.decision === 'changes_requested') status = 'changes_requested';
    else if (historical.length) status = 'stale_confirmation';
    return { ...item, status, confirmation, historical };
  });
  return {
    status: !items.length
      ? 'unreported'
      : items.some((i) => i.status === 'changes_requested')
        ? 'changes_requested'
        : items.some((i) => i.status === 'unknown')
          ? 'unknown'
          : items.some((i) => ['awaiting_confirmation', 'stale_confirmation'].includes(i.status))
            ? 'awaiting_confirmation'
            : items.every((i) => i.status === 'not_applicable')
              ? 'not_applicable'
              : 'confirmed',
    items,
  };
}
