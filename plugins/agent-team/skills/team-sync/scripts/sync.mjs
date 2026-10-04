#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { appendOperation, readTracking } from './tracking-core.mjs';

const HELP = `Agent Team portable tracking (Node.js 20+, no dependencies)
Usage: node sync.mjs OPERATION --workspace PATH [options]
Operations: team task run activity acceptance review-requirement review artifact result skill read
Common: --workspace PATH --data-dir PATH --team-id ID --task-id ID --run-id ID
        --event-id ID (reuse for retries) --revision INTEGER --producer NAME --timestamp ISO
        --body-file PATH (JSON object supplies command fields; CLI overrides it)
team: --title TEXT --provider NAME --root-session-id ID
task: --title TEXT --goal TEXT --role NAME --status STATUS --dependencies ID,ID
      --version AC_VERSION --task-type code|design|documentation|analysis
      --acceptance-items JSON_ARRAY (or body-file acceptanceItems; required on creation)
      AC: {id,label,method,verifier:agent|human,kind:check|unit_test|prototype|delivery}
      Every card requires Agent conditions; human conditions only when manual verification is needed.
      Human AC requires manualCheck: {entry,steps:[...],expected}.
      --blocked-reason TEXT --activity-summary TEXT
      STATUS: queued running awaiting_review repair_required blocked completed
run:  --title TEXT --provider NAME --native-agent-id ID --native-role TYPE --parent-run-id ID --role NAME
      --version AC_VERSION --task-type TYPE --acceptance-items JSON_ARRAY (independent run AC)
      --agent-name NAME --profile NAME --goal TEXT --activity-summary TEXT --status STATUS
      STATUS: queued running completed failed interrupted
activity: --summary TEXT --evidence TEXT
acceptance: --item-id ID --label TEXT --status pending|unknown|passed|failed
            --evidence TEXT --reported-by NAME --version AC_VERSION --digest RESULT_SHA256
            [--run-id ID]; human items can only be satisfied by human review.
result: --reference WORKSPACE_FILE --version RESULT_VERSION [--run-id ID]
        File and previously registered artifacts must remain current.
review-requirement: --requirement-id ID --type spec|adr|ui|visual|tickets|delivery
                    --reference WORKSPACE_FILE --version VERSION
                    --affected-task-ids ID,ID --label TEXT
                    --item-id HUMAN_AC_ID [--run-id ID] for delivery/ui/visual
                    digest and immutable snapshot calculated from actual file
review: --review-id ID --author NAME --author-type agent|human --scope TEXT [--run-id ID]
        --decision approved|rejected|comment --evidence TEXT
        Human additionally: --reporter-role coordinator --quote USER_WORDS
        --requirement-id ID --version VERSION --digest SHA256
        Human provenance is a declaration, not identity authentication.
artifact: --artifact-id ID --reference WORKSPACE_FILE --label TEXT
skill: --skill-id ID --name NAME --reference PATH --status read|applied|unavailable
       --evidence TEXT
read: returns {teams,tasks,runs,lastEventAt,eventCount} JSON; it never creates a task.
Default data-dir: AGENT_TEAM_DATA_DIR or WORKSPACE/.agent-team.
Each workspace has isolated archive scope. Writes are atomic and serialized.
Lock timeout reports recovery path; do not remove a lock while a writer is running.
No operation executes, schedules, approves, or authenticates an agent.
`;

const names = [
  'workspace',
  'data-dir',
  'team-id',
  'task-id',
  'run-id',
  'event-id',
  'revision',
  'producer',
  'timestamp',
  'body-file',
  'title',
  'provider',
  'root-session-id',
  'goal',
  'role',
  'status',
  'dependencies',
  'blocked-reason',
  'activity-summary',
  'native-agent-id',
  'native-role',
  'parent-run-id',
  'agent-name',
  'profile',
  'summary',
  'evidence',
  'item-id',
  'label',
  'reported-by',
  'requirement-id',
  'type',
  'reference',
  'version',
  'affected-task-ids',
  'review-id',
  'author',
  'author-type',
  'decision',
  'reporter-role',
  'quote',
  'digest',
  'scope',
  'artifact-id',
  'skill-id',
  'name',
  'task-type',
  'acceptance-items',
];
function camel(name) {
  return name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

try {
  const { values, positionals } = parseArgs({
    options: {
      ...Object.fromEntries(names.map((name) => [name, { type: 'string' }])),
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
  } else {
    if (positionals.length !== 1) throw new Error('Specify exactly one operation');
    const body = values['body-file']
      ? JSON.parse((await readFile(values['body-file'], 'utf8')).replace(/^\uFEFF/, ''))
      : {};
    if (!body || Array.isArray(body) || typeof body !== 'object')
      throw new Error('body-file must contain a JSON object');
    const options = {
      ...body,
      ...Object.fromEntries(
        Object.entries(values)
          .filter(([key]) => !['body-file', 'help'].includes(key))
          .map(([key, value]) => [camel(key), value]),
      ),
    };
    const config = { workspace: options.workspace, dataDir: options.dataDir };
    delete options.workspace;
    delete options.dataDir;
    if (typeof options.revision === 'string') options.revision = Number(options.revision);
    if (typeof options.dependencies === 'string')
      options.dependencies = options.dependencies.split(',').filter(Boolean);
    if (typeof options.affectedTaskIds === 'string')
      options.affectedTaskIds = options.affectedTaskIds.split(',').filter(Boolean);
    if (typeof options.acceptanceItems === 'string')
      options.acceptanceItems = JSON.parse(options.acceptanceItems);
    const result =
      positionals[0] === 'read'
        ? await readTracking(config)
        : await appendOperation(config, { ...options, kind: positionals[0] });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`team-sync: ${error.message}\n`);
  process.exitCode = 1;
}
