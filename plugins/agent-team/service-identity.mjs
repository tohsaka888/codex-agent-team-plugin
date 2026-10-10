import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
function identityFile(workspace, dataDir, port) {
  const scope = process.platform === 'win32' ? workspace.toLowerCase() : workspace;
  return resolve(
    dataDir,
    'web-services',
    createHash('sha256').update(scope).digest('hex') + '-' + port + '.json',
  );
}
export async function saveServiceIdentity(identity, port) {
  const file = identityFile(identity.workspace, identity.dataDir, port);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(identity), { mode: 0o600 });
}
export async function knownServiceIdentity(workspace, dataDir, port) {
  try {
    return JSON.parse(await readFile(identityFile(workspace, dataDir, port), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
