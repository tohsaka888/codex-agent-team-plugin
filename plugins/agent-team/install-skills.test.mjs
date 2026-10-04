import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { installSkills } from './install-skills.mjs';

test('project skill installer preserves existing user files and installs optional profiles', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'agent-skills-'));
  try {
    const first = await installSkills({ workspace, codexProfiles: true });
    assert.equal(first.filter((r) => r.status === 'installed').length, 10);
    const path = resolve(workspace, '.agents/skills/team-sync/SKILL.md');
    await writeFile(path, 'user customization');
    const second = await installSkills({ workspace, codexProfiles: true });
    assert.ok(second.every((r) => r.status === 'existing-preserved'));
    assert.equal(await readFile(path, 'utf8'), 'user customization');
    assert.match(
      await readFile(resolve(workspace, '.codex/agents/ue.toml'), 'utf8'),
      /name = "ue"/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
