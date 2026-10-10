import { knownServiceIdentity } from './service-identity.mjs';
import { realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
const here = dirname(fileURLToPath(import.meta.url));
const same = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export async function openWeb({
  workspace,
  dataDir,
  teamId,
  port = 43782,
  noOpen = false,
  serverPath = resolve(here, 'web-server.mjs'),
} = {}) {
  if (!workspace) throw new Error('必须明确 --workspace');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须为 1 至 65535');
  const root = await realpath(resolve(workspace));
  const archive = resolve(
    dataDir || process.env.AGENT_TEAM_DATA_DIR || resolve(root, '.agent-team'),
  );
  const base = 'http://127.0.0.1:' + port;
  async function probe() {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) });
      const identity = await response.json();
      if (
        !response.ok ||
        identity.service !== 'agent-team-web' ||
        identity.version !== 1 ||
        !same(identity.workspace || '', root) ||
        !same(identity.dataDir || '', archive)
      )
        throw new Error('端口已被其他服务或不同工作区/数据目录占用');
      const known = await knownServiceIdentity(root, archive, port);
      if (
        !known ||
        !identity.readOnly ||
        !Number.isSafeInteger(identity.pid) ||
        known.pid !== identity.pid ||
        known.instanceToken !== identity.instanceToken
      )
        throw new Error('服务没有已登记的本机实例身份；拒绝复用未知服务');
      return true;
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TimeoutError') return false;
      throw error;
    }
  }
  let reused = await probe();
  if (!reused) {
    const child = spawn(
      process.execPath,
      [serverPath, '--workspace', root, '--data-dir', archive, '--port', String(port)],
      { detached: true, stdio: 'ignore', windowsHide: true, cwd: root },
    );
    let launchError;
    child.on('error', (error) => {
      launchError = error;
    });
    child.unref();
    let running = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (launchError) throw launchError;
      await delay(100);
      if (await probe()) {
        running = true;
        break;
      }
    }
    if (!running) throw new Error('网页服务未启动：端口可能被占用，请使用 --port 指定其他端口');
  }
  const url = new URL(base + '/');
  url.searchParams.set('transport', 'http');
  if (teamId) url.searchParams.set('teamId', teamId);
  if (!noOpen) {
    const command =
      process.platform === 'win32'
        ? 'rundll32.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    const args =
      process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
    const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise((done, fail) => {
      browser.once('spawn', done);
      browser.once('error', fail);
    });
    browser.unref();
  }
  return { url: url.href, reused, workspace: root, dataDir: archive };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        workspace: { type: 'string' },
        'data-dir': { type: 'string' },
        'team-id': { type: 'string' },
        port: { type: 'string' },
        'no-open': { type: 'boolean' },
      },
    });
    console.log(
      JSON.stringify(
        await openWeb({
          workspace: values.workspace,
          dataDir: values['data-dir'],
          teamId: values['team-id'],
          port: values.port === undefined ? undefined : Number(values.port),
          noOpen: values['no-open'],
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
