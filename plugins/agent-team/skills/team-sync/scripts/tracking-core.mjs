import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, open, link, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { validateContract, contractSignature, acceptanceState } from './acceptance-contract.mjs';

const KINDS = new Set([
  'team',
  'task',
  'run',
  'activity',
  'acceptance',
  'review-requirement',
  'review',
  'artifact',
  'skill',
  'result',
]);
const TASK_STATUSES = new Set([
  'queued',
  'running',
  'awaiting_review',
  'repair_required',
  'blocked',
  'completed',
]);
const RUN_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'interrupted']);
const OPERATION_FIELDS = {
  team: ['title', 'provider', 'rootSessionId'],
  task: [
    'title',
    'goal',
    'role',
    'status',
    'activitySummary',
    'dependencies',
    'blockedReason',
    'acceptanceItems',
    'version',
    'taskType',
  ],
  run: [
    'runId',
    'title',
    'provider',
    'nativeAgentId',
    'nativeRole',
    'parentRunId',
    'role',
    'agentName',
    'profile',
    'status',
    'goal',
    'activitySummary',
    'acceptanceItems',
    'version',
    'taskType',
  ],
  activity: ['runId', 'summary', 'evidence'],
  acceptance: ['runId', 'itemId', 'label', 'status', 'evidence', 'reportedBy', 'version', 'digest'],
  'review-requirement': [
    'requirementId',
    'type',
    'reference',
    'version',
    'label',
    'affectedTaskIds',
    'runId',
    'itemId',
  ],
  review: [
    'reviewId',
    'author',
    'authorType',
    'decision',
    'evidence',
    'reporterRole',
    'quote',
    'requirementId',
    'version',
    'digest',
    'scope',
    'runId',
  ],
  artifact: ['artifactId', 'reference', 'label', 'runId'],
  result: ['runId', 'reference', 'version'],
  skill: ['runId', 'skillId', 'name', 'reference', 'status', 'evidence'],
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function required(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000)
    throw new Error(`${field} must be a non-empty string`);
  return value;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

async function workspaceFile(workspace, reference) {
  required(reference, 'reference');
  const candidate = path.resolve(workspace, reference);
  if (!inside(workspace, candidate)) throw new Error('reference is outside workspace');
  const actual = await realpath(candidate);
  if (!inside(workspace, actual)) throw new Error('reference symlink is outside workspace');
  return actual;
}

async function location(config) {
  const workspace = await realpath(path.resolve(config.workspace || process.cwd()));
  const dataDir = path.resolve(
    config.dataDir || process.env.AGENT_TEAM_DATA_DIR || path.join(workspace, '.agent-team'),
  );
  const scope = path.join(
    dataDir,
    'workspaces',
    sha256(process.platform === 'win32' ? workspace.toLowerCase() : workspace),
  );
  return { workspace, scope, eventsDir: path.join(scope, 'events') };
}

async function eventsAt(loc) {
  let names;
  try {
    names = await readdir(loc.eventsDir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const events = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    const event = JSON.parse(await readFile(path.join(loc.eventsDir, name), 'utf8'));
    if (event.protocolVersion !== 1 || event.workspace !== loc.workspace)
      throw new Error(`Invalid event scope/protocol: ${name}`);
    events.push(event);
  }
  return events.sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
}

function entityKey(operation) {
  const suffix = ['run', 'activity', 'skill'].includes(operation.kind)
    ? operation.runId
    : operation.taskId || '';
  const item =
    operation.itemId ||
    operation.requirementId ||
    operation.reviewId ||
    operation.artifactId ||
    operation.skillId ||
    '';
  const parts = [operation.kind, operation.teamId, suffix, item];
  if (operation.runId && !['run', 'activity', 'skill'].includes(operation.kind))
    parts.push(operation.runId);
  return JSON.stringify(parts);
}

function fields(operation, names) {
  return Object.fromEntries(
    names.filter((name) => operation[name] !== undefined).map((name) => [name, operation[name]]),
  );
}

function fold(events, workspace) {
  const teams = new Map();
  const tasks = new Map();
  const runs = new Map();
  const revisions = new Map();
  const key = (teamId, id) => JSON.stringify([teamId, id]);
  for (const event of events) {
    const op = event.operation;
    const revisionKey = entityKey(op);
    const isCurrent = event.revision > (revisions.get(revisionKey) ?? 0);
    if (!isCurrent) continue;
    revisions.set(revisionKey, event.revision);
    const metadata = {
      updatedAt: event.timestamp,
      revision: event.revision,
      producer: event.producer,
    };
    if (op.kind === 'team') {
      teams.set(op.teamId, {
        ...teams.get(op.teamId),
        teamId: op.teamId,
        ...fields(op, ['title', 'provider', 'rootSessionId']),
        ...metadata,
      });
      continue;
    }
    const taskKey = key(op.teamId, op.taskId);
    const task = tasks.get(taskKey);
    if (op.kind === 'task') {
      tasks.set(taskKey, {
        status: 'queued',
        acceptanceItems: [],
        reviewRequirements: [],
        reviewRecords: [],
        artifacts: [],
        ...task,
        teamId: op.teamId,
        taskId: op.taskId,
        ...fields(op, [
          'title',
          'goal',
          'role',
          'status',
          'activitySummary',
          'dependencies',
          'blockedReason',
          'acceptanceItems',
          'version',
          'taskType',
        ]),
        ...metadata,
        ...(op.goal !== undefined
          ? {
              goalReportedBy: event.producer,
              goalReportedAt: event.timestamp,
              goalEventId: event.eventId,
            }
          : {}),
      });
      if (op.acceptanceItems) {
        const updated = tasks.get(taskKey);
        updated.acceptanceHistory = [
          ...(task?.acceptanceHistory || []),
          ...(task?.acKey
            ? [{ version: task.version, acKey: task.acKey, items: task.acceptanceItems }]
            : []),
        ];
        updated.acKey = sha256(contractSignature(updated));
      }
      continue;
    }
    const runKey = key(op.teamId, op.runId);
    if (op.kind === 'run') {
      const previous = runs.get(runKey);
      const updatedAt =
        previous && Date.parse(previous.updatedAt) > Date.parse(event.timestamp)
          ? previous.updatedAt
          : event.timestamp;
      runs.set(runKey, {
        status: 'running',
        activities: [],
        skills: [],
        acceptanceItems: [],
        reviewRequirements: [],
        reviewRecords: [],
        artifacts: [],
        ...previous,
        teamId: op.teamId,
        taskId: op.taskId,
        runId: op.runId,
        ...fields(op, [
          'provider',
          'nativeAgentId',
          'nativeRole',
          'parentRunId',
          'role',
          'agentName',
          'profile',
          'title',
          'status',
          'goal',
          'acceptanceItems',
          'version',
          'taskType',
        ]),
        ...metadata,
        updatedAt,
        statusUpdatedAt:
          op.status !== undefined || !previous ? event.timestamp : previous.statusUpdatedAt,
        activitySummary:
          op.activitySummary !== undefined &&
          (!previous?.activitySummaryAt ||
            Date.parse(event.timestamp) >= Date.parse(previous.activitySummaryAt))
            ? op.activitySummary
            : previous?.activitySummary,
        activitySummaryAt:
          op.activitySummary !== undefined &&
          (!previous?.activitySummaryAt ||
            Date.parse(event.timestamp) >= Date.parse(previous.activitySummaryAt))
            ? event.timestamp
            : previous?.activitySummaryAt,
      });
      if (op.acceptanceItems) {
        const updated = runs.get(runKey);
        updated.acceptanceHistory = [
          ...(previous?.acceptanceHistory || []),
          ...(previous?.acKey
            ? [
                {
                  version: previous.version,
                  acKey: previous.acKey,
                  items: previous.acceptanceItems,
                },
              ]
            : []),
        ];
        updated.acKey = sha256(contractSignature(updated));
      }
      continue;
    }
    if (op.kind === 'activity' || op.kind === 'skill') {
      const run = runs.get(runKey);
      if (!run) throw new Error(`Event references missing run: ${op.runId}`);
      if (op.kind === 'activity') {
        run.activities.push({
          eventId: event.eventId,
          summary: op.summary,
          timestamp: event.timestamp,
          evidence: op.evidence || '',
        });
        if (
          !run.activitySummaryAt ||
          Date.parse(event.timestamp) >= Date.parse(run.activitySummaryAt)
        ) {
          run.activitySummary = op.summary;
          run.activitySummaryAt = event.timestamp;
        }
      } else {
        const skill = {
          ...fields(op, ['skillId', 'name', 'reference', 'status', 'evidence']),
          ...metadata,
        };
        run.skills = [...run.skills.filter((item) => item.skillId !== op.skillId), skill];
      }
      if (Date.parse(event.timestamp) >= Date.parse(run.updatedAt)) run.updatedAt = event.timestamp;
      continue;
    }
    if (!task) throw new Error(`Event references missing task: ${op.taskId}`);
    const target = op.runId ? runs.get(runKey) : task;
    if (!target) throw new Error(`Event references missing run: ${op.runId}`);
    if (op.kind === 'result') {
      target.resultHistory = [
        ...(target.resultHistory || []),
        ...(target.resultDigest
          ? [
              {
                version: target.resultVersion,
                digest: target.resultDigest,
                reference: target.resultReference,
              },
            ]
          : []),
      ];
      Object.assign(target, {
        resultReference: op.reference,
        resultDigest: op.digest,
        resultVersion: op.version,
        resultArtifactKey: op.artifactKey,
        resultCurrent: true,
      });
      continue;
    }
    const collections = {
      acceptance: ['acceptanceItems', 'itemId'],
      'review-requirement': ['reviewRequirements', 'requirementId'],
      review: ['reviewRecords', 'reviewId'],
      artifact: ['artifacts', 'artifactId'],
    };
    const [collection, identifier] = collections[op.kind];
    const item = {
      ...op,
      id: op[identifier],
      ...metadata,
      eventId: event.eventId,
    };
    delete item.kind;
    const existing = target[collection].find((entry) => entry.id === item.id);
    const history = existing
      ? [
          ...(existing.history || []),
          Object.fromEntries(Object.entries(existing).filter(([name]) => name !== 'history')),
        ]
      : [];
    target[collection] =
      op.kind === 'acceptance' && existing
        ? target[collection].map((entry) =>
            entry.id === item.id ? { ...existing, ...item, history } : entry,
          )
        : [
            ...target[collection].filter((entry) => entry.id !== item.id),
            { ...existing, ...item, history },
          ];
    if (op.kind === 'acceptance') {
      const stored = target[collection].find((entry) => entry.id === item.id);
      stored.resultDigest = op.digest;
      stored.resultVersion = op.resultVersion;
    }
  }
  return {
    protocolVersion: 1,
    workspace,
    teams: [...teams.values()],
    tasks: [...tasks.values()],
    runs: [...runs.values()],
    lastEventAt: events.at(-1)?.recordedAt || events.at(-1)?.timestamp || null,
    eventCount: events.length,
  };
}

function assertPrototypeDependencies(snapshot, task) {
  for (const id of task.dependencies || []) {
    const upstream = snapshot.tasks.find((t) => t.teamId === task.teamId && t.taskId === id);
    const entities = [
      upstream,
      ...snapshot.runs.filter((r) => r.teamId === task.teamId && r.taskId === id),
    ].filter(Boolean);
    for (const entity of entities) {
      for (const item of entity.acceptance?.items.filter((i) => i.kind === 'prototype') || []) {
        const requirement = entity.reviewRequirements.find(
          (q) => q.itemId === item.id && ['ui', 'visual'].includes(q.type),
        );
        if (item.status !== 'passed' || !requirement?.affectedTaskIds?.includes(task.taskId))
          throw new Error('AC upstream prototype must be confirmed for this task before dispatch');
      }
    }
  }
}

function validate(operation, snapshot) {
  if (!KINDS.has(operation.kind)) throw new Error(`Unsupported operation: ${operation.kind}`);
  const allowed = new Set(['kind', 'teamId', 'taskId', ...OPERATION_FIELDS[operation.kind]]);
  for (const field of Object.keys(operation)) {
    if (!allowed.has(field)) throw new Error(`Unsupported field for ${operation.kind}: ${field}`);
  }
  for (const field of [
    'provider',
    'nativeAgentId',
    'nativeRole',
    'rootSessionId',
    'parentRunId',
    'role',
    'agentName',
    'profile',
    'goal',
    'activitySummary',
    'blockedReason',
  ]) {
    if (operation[field] !== undefined && !(field === 'blockedReason' && operation[field] === null))
      required(operation[field], field);
  }
  required(operation.teamId, 'teamId');
  if (operation.kind === 'team') return;
  if (!snapshot.teams.some((team) => team.teamId === operation.teamId))
    throw new Error('Register team first');
  required(operation.taskId, 'taskId');
  const task = snapshot.tasks.find(
    (entry) => entry.teamId === operation.teamId && entry.taskId === operation.taskId,
  );
  if (operation.kind === 'task') {
    if (!task && (!Array.isArray(operation.acceptanceItems) || !operation.acceptanceItems.length))
      throw new Error('AC acceptanceItems must be a non-empty array');
    if (operation.acceptanceItems !== undefined) {
      validateContract({ ...task, ...operation });
      operation.acceptanceItems = operation.acceptanceItems.map((item) => ({
        ...item,
        status: 'pending',
      }));
    }
    if (
      task &&
      ['version', 'role', 'taskType', 'goal'].some(
        (field) => operation[field] !== undefined && operation[field] !== task[field],
      ) &&
      !operation.acceptanceItems
    )
      throw new Error('AC changes require complete acceptanceItems');
    if (
      ['running', 'awaiting_review', 'completed'].includes(operation.status) &&
      !task?.acKey &&
      !operation.acceptanceItems
    )
      throw new Error('AC must be supplied before resuming legacy task');
    if (['running', 'awaiting_review', 'completed'].includes(operation.status))
      assertPrototypeDependencies(snapshot, { ...task, ...operation });
    if (['awaiting_review', 'completed'].includes(operation.status)) {
      const state = task?.acceptance || acceptanceState(task);
      if (operation.acceptanceItems || !state.agentReady)
        throw new Error('AC Agent verification and current result required before review');
      if (
        operation.status === 'completed' &&
        (!state.accepted ||
          snapshot.runs.some(
            (r) =>
              r.teamId === task.teamId &&
              r.taskId === task.taskId &&
              (r.status !== 'completed' || !r.acceptance?.accepted),
          ))
      )
        throw new Error(
          'AC completed requires current Agent Review and human acceptance for every card',
        );
    }
    if (!task) required(operation.title, 'title');
    if (operation.status !== undefined && !TASK_STATUSES.has(operation.status))
      throw new Error('Invalid task status');
    if (
      operation.dependencies !== undefined &&
      (!Array.isArray(operation.dependencies) ||
        operation.dependencies.some((id) => typeof id !== 'string' || !id.trim()))
    )
      throw new Error('dependencies must be an array of task IDs');
    return;
  }
  if (!task) throw new Error('Register task first');
  if (['run', 'activity', 'skill'].includes(operation.kind)) {
    required(operation.runId, 'runId');
    const run = snapshot.runs.find(
      (entry) => entry.teamId === operation.teamId && entry.runId === operation.runId,
    );
    if (run && run.taskId !== operation.taskId)
      throw new Error('runId already belongs to another task');
    if (operation.kind !== 'run' && !run) throw new Error('Register run first');
    if (operation.kind === 'run') {
      if (!run) required(operation.provider, 'provider');
      if (
        (!run || (!run.acKey && ['queued', 'running'].includes(operation.status))) &&
        !operation.acceptanceItems
      )
        throw new Error('AC acceptanceItems required for run');
      if (!task.acKey) throw new Error('AC must be supplied on parent before dispatch');
      if (!run || ['queued', 'running'].includes(operation.status) || operation.acceptanceItems) {
        assertPrototypeDependencies(snapshot, task);
        if (run?.parentReferencesCurrent === false && !operation.acceptanceItems)
          throw new Error('AC parent reference must be refreshed before resuming run');
      }
      if (operation.acceptanceItems !== undefined) {
        validateContract({ ...run, ...operation });
        for (const item of operation.acceptanceItems) {
          if (
            item.parentItemId !== undefined &&
            (item.parentVersion !== task.version ||
              !task.acceptanceItems.some((parent) => parent.id === item.parentItemId))
          )
            throw new Error('AC parent reference/version must match current task');
        }
        operation.acceptanceItems = operation.acceptanceItems.map((item) => ({
          ...item,
          status: 'pending',
          ...(item.parentItemId ? { parentAcKey: task.acKey } : {}),
        }));
      }
      if (
        run &&
        ['version', 'role', 'taskType', 'goal'].some(
          (field) => operation[field] !== undefined && operation[field] !== run[field],
        ) &&
        !operation.acceptanceItems
      )
        throw new Error('AC changes require complete acceptanceItems');
      for (const field of ['provider', 'nativeAgentId']) {
        if (run?.[field] && operation[field] !== undefined && run[field] !== operation[field])
          throw new Error(`Run ${field} cannot change`);
      }
      if (operation.status !== undefined && !RUN_STATUSES.has(operation.status))
        throw new Error('Invalid run status');
      if (operation.parentRunId !== undefined) {
        if (
          operation.parentRunId === operation.runId ||
          !snapshot.runs.some(
            (entry) => entry.teamId === operation.teamId && entry.runId === operation.parentRunId,
          )
        )
          throw new Error('parentRunId must reference another existing run in this team');
        let ancestorId = operation.parentRunId;
        const seen = new Set([operation.runId]);
        while (ancestorId) {
          if (seen.has(ancestorId)) throw new Error('parentRunId creates a cycle');
          seen.add(ancestorId);
          ancestorId = snapshot.runs.find(
            (entry) => entry.teamId === operation.teamId && entry.runId === ancestorId,
          )?.parentRunId;
        }
      }
    }
    if (operation.kind === 'activity') required(operation.summary, 'summary');
    if (operation.kind === 'skill') {
      required(operation.skillId, 'skillId');
      required(operation.name, 'name');
      if (!['read', 'applied', 'unavailable'].includes(operation.status))
        throw new Error('Invalid skill status');
      required(operation.evidence, 'evidence');
    }
    return;
  }
  const target = operation.runId
    ? snapshot.runs.find(
        (run) =>
          run.teamId === operation.teamId &&
          run.taskId === operation.taskId &&
          run.runId === operation.runId,
      )
    : task;
  if (!target) throw new Error('runId must belong to this task');
  if (operation.kind === 'result') {
    if (!target.acKey) throw new Error('AC must be supplied before result');
    required(operation.reference, 'reference');
    required(operation.version, 'version');
  }
  if (operation.kind === 'acceptance') {
    required(operation.itemId, 'itemId');
    const definition = target.acceptanceItems.find((item) => item.id === operation.itemId);
    if (!target.acKey || !definition)
      throw new Error('AC must reference an existing definition; update contract atomically');
    if (operation.label !== undefined && operation.label !== definition.label)
      throw new Error('AC label changes require a new contract');
    if (definition.verifier === 'human')
      throw new Error('AC human conditions require human review, not Agent acceptance updates');
    if (!['pending', 'unknown', 'passed', 'failed'].includes(operation.status))
      throw new Error('Invalid acceptance status');
    if (['passed', 'failed'].includes(operation.status)) {
      required(operation.evidence, 'evidence');
      required(operation.reportedBy, 'reportedBy');
      if (
        !target.resultDigest ||
        target.resultCurrent === false ||
        operation.version !== target.version ||
        operation.digest !== target.resultDigest
      )
        throw new Error('AC verification must match current result digest and contract version');
    }
  }
  if (operation.kind === 'review-requirement') {
    required(operation.requirementId, 'requirementId');
    required(operation.version, 'version');
    required(operation.reference, 'reference');
    required(operation.type, 'type');
    if (['ui', 'visual'].includes(operation.type) && operation.affectedTaskIds === undefined)
      operation.affectedTaskIds = [operation.taskId];
    if (target.acKey && ['delivery', 'ui', 'visual'].includes(operation.type)) {
      const condition = target.acceptanceItems.find(
        (i) =>
          i.id === operation.itemId &&
          i.verifier === 'human' &&
          (operation.type === 'delivery' ? i.kind === 'delivery' : i.kind === 'prototype'),
      );
      if (!condition)
        throw new Error('AC human review requirement must reference the matching itemId');
      if (
        operation.type === 'delivery' &&
        (!target.resultDigest ||
          target.resultCurrent === false ||
          operation.reference !== target.resultReference ||
          operation.version !== target.resultVersion)
      )
        throw new Error('AC delivery requirement must reference current result file and version');
    }
    if (!['spec', 'adr', 'ui', 'visual', 'tickets', 'delivery'].includes(operation.type))
      throw new Error('Invalid review requirement type');
    if (
      operation.affectedTaskIds !== undefined &&
      (!Array.isArray(operation.affectedTaskIds) ||
        operation.affectedTaskIds.some(
          (id) =>
            !snapshot.tasks.some(
              (entry) => entry.teamId === operation.teamId && entry.taskId === id,
            ),
        ))
    )
      throw new Error('affectedTaskIds must refer to existing tasks in this team');
  }
  if (operation.kind === 'review') {
    required(operation.reviewId, 'reviewId');
    required(operation.author, 'author');
    required(operation.evidence, 'evidence');
    if (!['agent', 'human'].includes(operation.authorType))
      throw new Error('authorType must be agent or human');
    if (!['approved', 'rejected', 'comment'].includes(operation.decision))
      throw new Error('Invalid review decision');
    if (
      operation.authorType === 'agent' &&
      operation.scope === 'delivery' &&
      target.acKey &&
      (!target.acceptance?.agentReady ||
        operation.version !== target.resultVersion ||
        operation.digest !== target.resultDigest)
    )
      throw new Error('AC Agent Review requires verified current result version/digest');
    if (operation.authorType === 'human') {
      if (operation.reporterRole !== 'coordinator')
        throw new Error(
          'Human review must be declared by coordinator; source is not authentication',
        );
      required(operation.quote, 'quote');
      required(operation.requirementId, 'requirementId');
      const requirement = target.reviewRequirements.find(
        (item) => item.id === operation.requirementId,
      );
      if (
        !requirement ||
        requirement.version !== operation.version ||
        requirement.digest !== operation.digest
      )
        throw new Error('Review must match current requirement version and digest');
      if (
        target.acKey &&
        (requirement.acKey !== target.acKey ||
          requirement.fileCurrent === false ||
          (requirement.type === 'delivery' &&
            (!target.resultDigest ||
              target.resultCurrent === false ||
              requirement.resultDigest !== target.resultDigest ||
              requirement.resultVersion !== target.resultVersion)))
      )
        throw new Error('Human review must match current AC and result');
    }
  }
  if (operation.kind === 'artifact') {
    required(operation.artifactId, 'artifactId');
    required(operation.reference, 'reference');
  }
  if (
    operation.runId !== undefined &&
    ['review', 'artifact'].includes(operation.kind) &&
    !snapshot.runs.some(
      (run) =>
        run.teamId === operation.teamId &&
        run.taskId === operation.taskId &&
        run.runId === operation.runId,
    )
  )
    throw new Error('runId must belong to this task');
}

async function publish(filename, content) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, filename);
  } finally {
    await unlink(temporary);
  }
}

async function withWriterLock(loc, work) {
  await mkdir(loc.eventsDir, { recursive: true });
  const lockPath = path.join(loc.scope, '.writer.lock');
  let handle;
  const deadline = Date.now() + 10000;
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline)
        throw new Error(
          `Writer lock timeout. After confirming no writer is running, remove ${lockPath}`,
        );
      await delay(25);
    }
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await work();
  } finally {
    await handle.close();
    await unlink(lockPath);
  }
}

export async function readTracking(config = {}) {
  const loc = await location(config);
  return refreshAcceptance(fold(await eventsAt(loc), loc.workspace), loc.workspace);
}

async function fileMatches(workspace, reference, digest) {
  if (!reference || !digest) return false;
  try {
    return sha256(await readFile(await workspaceFile(workspace, reference))) === digest;
  } catch {
    return false;
  }
}
function artifactKey(target) {
  return sha256(stable((target.artifacts || []).map((a) => [a.id, a.reference, a.digest])));
}
async function refreshAcceptance(snapshot, workspace) {
  for (const target of [...snapshot.tasks, ...snapshot.runs]) {
    if (target.acKey) {
      const parent = target.runId
        ? snapshot.tasks.find((t) => t.teamId === target.teamId && t.taskId === target.taskId)
        : null;
      target.parentReferencesCurrent =
        !target.runId ||
        (target.acceptanceItems || []).every(
          (i) =>
            !i.parentItemId ||
            (i.parentVersion === parent?.version &&
              i.parentAcKey === parent?.acKey &&
              parent?.acceptanceItems.some((p) => p.id === i.parentItemId)),
        );
      const artifactsCurrent = (
        await Promise.all(
          (target.artifacts || []).map((a) => fileMatches(workspace, a.reference, a.digest)),
        )
      ).every(Boolean);
      target.resultCurrent =
        artifactsCurrent &&
        target.resultArtifactKey === artifactKey(target) &&
        (await fileMatches(workspace, target.resultReference, target.resultDigest));
      for (const requirement of target.reviewRequirements || [])
        requirement.fileCurrent = await fileMatches(
          workspace,
          requirement.reference,
          requirement.digest,
        );
    }
    target.acceptance = acceptanceState(target);
  }
  return snapshot;
}

export async function appendOperation(config, input) {
  const loc = await location(config);
  const operation = JSON.parse(JSON.stringify(input));
  const eventId = operation.eventId || randomUUID();
  required(eventId, 'eventId');
  const producer = operation.producer || 'team-sync';
  required(producer, 'producer');
  const revision = operation.revision;
  if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1))
    throw new Error('revision must be a positive safe integer');
  const timestamp = operation.timestamp;
  if (
    timestamp !== undefined &&
    (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp)))
  )
    throw new Error('Invalid timestamp');
  for (const name of ['eventId', 'producer', 'revision', 'timestamp']) delete operation[name];
  if (operation.nativeId !== undefined && operation.nativeAgentId === undefined)
    operation.nativeAgentId = operation.nativeId;
  delete operation.nativeId;
  const requestDigest = sha256(
    stable({
      operation,
      producer,
      revision: revision ?? null,
      timestamp: timestamp ?? null,
    }),
  );
  return withWriterLock(loc, async () => {
    const events = await eventsAt(loc);
    const duplicate = events.find((event) => event.eventId === eventId);
    if (duplicate) {
      if (duplicate.requestDigest !== requestDigest)
        throw new Error('eventId already exists with different content');
      return { eventId, duplicate: true, event: duplicate };
    }
    const snapshot = await refreshAcceptance(fold(events, loc.workspace), loc.workspace);
    validate(operation, snapshot);
    const target = operation.runId
      ? snapshot.runs.find((r) => r.teamId === operation.teamId && r.runId === operation.runId)
      : snapshot.tasks.find((t) => t.teamId === operation.teamId && t.taskId === operation.taskId);
    if (operation.kind === 'review-requirement')
      operation.scopeKey = sha256(stable(operation.affectedTaskIds || [operation.taskId]));
    if (operation.kind === 'review' && operation.authorType === 'human')
      operation.scopeKey = target?.reviewRequirements.find(
        (q) => q.id === operation.requirementId,
      )?.scopeKey;
    if (['acceptance', 'review', 'review-requirement'].includes(operation.kind) && target?.acKey) {
      operation.acKey = target.acKey;
      operation.resultDigest = target.resultDigest || null;
      operation.resultVersion = target.resultVersion || null;
    }
    if (['review-requirement', 'artifact', 'result'].includes(operation.kind)) {
      const actual = await workspaceFile(loc.workspace, operation.reference);
      const info = await stat(actual);
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        throw new Error('Referenced file is not a file or exceeds 8 MiB');
      const content = await readFile(actual);
      if (content.length > 8 * 1024 * 1024) throw new Error('Referenced file exceeds 8 MiB');
      operation.reference = path.relative(loc.workspace, actual).split(path.sep).join('/');
      operation.digest = sha256(content);
      if (operation.kind === 'result') operation.artifactKey = artifactKey(target);
      if (operation.kind === 'review-requirement') {
        const snapshotsDir = path.join(loc.scope, 'snapshots');
        await mkdir(snapshotsDir, { recursive: true });
        operation.snapshotReference = path.join(snapshotsDir, operation.digest);
        try {
          await publish(operation.snapshotReference, content);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
    }
    const latest = events
      .filter((event) => entityKey(event.operation) === entityKey(operation))
      .reduce((max, event) => Math.max(max, event.revision), 0);
    if (
      revision !== undefined &&
      events.some(
        (event) =>
          entityKey(event.operation) === entityKey(operation) && event.revision === revision,
      )
    )
      throw new Error('revision already exists for this entity; use the same eventId for retries');
    if (revision === undefined && !Number.isSafeInteger(latest + 1))
      throw new Error('Revision limit reached');
    const event = {
      protocolVersion: 1,
      eventId,
      producer,
      workspace: loc.workspace,
      revision: revision ?? latest + 1,
      timestamp: timestamp || new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      sequence: (events.at(-1)?.sequence || 0) + 1,
      requestDigest,
      operation,
    };
    await publish(
      path.join(loc.eventsDir, `${sha256(eventId)}.json`),
      `${JSON.stringify(event)}\n`,
    );
    return { eventId, duplicate: false, event };
  });
}
