import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));

export async function installSkills({ workspace, target, codexProfiles = false }) {
  if (!workspace) throw new Error('必须明确 --workspace');
  const root = resolve(workspace);
  const skillsDirectory = resolve(target || resolve(root, '.agents/skills'));
  const results = [];
  async function copyMissing(source, destination) {
    try {
      await access(destination);
      results.push({ path: destination, status: 'existing-preserved' });
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    results.push({ path: destination, status: 'installed' });
  }
  for (const name of ['agent-team', 'team-sync', 'team-review', 'team-ue']) {
    await copyMissing(resolve(here, 'skills', name), resolve(skillsDirectory, name));
  }
  if (codexProfiles) {
    for (const name of [
      'coordinator',
      'requirements',
      'architect',
      'developer',
      'reviewer',
      'ue',
    ]) {
      await copyMissing(
        resolve(here, 'skills/agent-team/references/profiles', name + '.toml'),
        resolve(root, '.codex/agents', name + '.toml'),
      );
    }
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf('--' + name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('缺少 --' + name);
    return args[index + 1];
  };
  try {
    if (args.includes('--help')) {
      console.log(
        'node install-skills.mjs --workspace <project> [--target <skills-directory>] [--codex-profiles]\n保留所有已存在目录；不修改全局配置。',
      );
    } else {
      console.log(
        JSON.stringify(
          await installSkills({
            workspace: option('workspace'),
            target: option('target'),
            codexProfiles: args.includes('--codex-profiles'),
          }),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
