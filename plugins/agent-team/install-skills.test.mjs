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
    const runtime = first.find(
      (r) => r.path.endsWith('agent-team\\web') || r.path.endsWith('agent-team/web'),
    );
    assert.equal(
      first.filter((r) => r.status === 'installed').length,
      runtime.status === 'installed' ? 12 : 11,
    );
    if (runtime.status === 'installed')
      assert.ok(
        await readFile(resolve(workspace, '.agents/skills/agent-team/web/open-web.mjs'), 'utf8'),
      );
    const setup = resolve(workspace, '.agents/skills/setup-agent-team');
    assert.match(await readFile(resolve(setup, 'SKILL.md'), 'utf8'), /name: setup-agent-team/);
    const manifest = JSON.parse(
      await readFile(resolve(setup, 'references/matt-skills.json'), 'utf8'),
    );
    assert.equal(manifest.skills.length, 31);
    assert.equal(manifest.commit, 'd81f3a183412e71a5b1e84ca21bc1a35eea03a60');
    assert.ok(
      await readFile(
        resolve(workspace, '.agents/skills/team-sync/references/skill-evidence.md'),
        'utf8',
      ),
    );
    assert.ok(await readFile(resolve(setup, 'references/mattpocock-LICENSE'), 'utf8'));
    assert.ok(
      await readFile(
        resolve(workspace, '.agents/skills/agent-team/references/efficient-workflow.md'),
        'utf8',
      ),
    );
    assert.match(
      await readFile(resolve(setup, 'agents/openai.yaml'), 'utf8'),
      /allow_implicit_invocation: false/,
    );
    await writeFile(resolve(setup, 'SKILL.md'), 'custom setup');
    const path = resolve(workspace, '.agents/skills/team-sync/SKILL.md');
    await writeFile(path, 'user customization');
    const second = await installSkills({ workspace, codexProfiles: true });
    assert.ok(
      second.every((r) => r.status === 'existing-preserved' || r.status === 'web-build-required'),
    );
    assert.equal(await readFile(resolve(setup, 'SKILL.md'), 'utf8'), 'custom setup');
    assert.equal(await readFile(path, 'utf8'), 'user customization');
    assert.match(
      await readFile(resolve(workspace, '.codex/agents/ue.toml'), 'utf8'),
      /name = "ue"/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
