import { randomUUID } from 'node:crypto';
import { saveServiceIdentity } from './service-identity.mjs';
import { createServer } from 'node:http';
import { readFile, realpath, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readPortableState } from './portable-state.mjs';
import { readInteractions } from './interactions.mjs';
import { readArtifact } from './artifact-reader.mjs';
const here = dirname(fileURLToPath(import.meta.url));
async function defaultHtmlPath() {
  const candidate = resolve(here, 'board.html');
  try {
    await access(candidate);
    return candidate;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(here, 'dist/web/board.html');
  }
}
export async function createWebServer({ workspace, dataDir, htmlPath } = {}) {
  const root = await realpath(resolve(workspace || process.cwd()));
  const archive = resolve(
    dataDir || process.env.AGENT_TEAM_DATA_DIR || resolve(root, '.agent-team'),
  );
  const scope = { root, dataDir: archive, portable: true };
  const identity = {
    service: 'agent-team-web',
    version: 1,
    pid: process.pid,
    workspace: root,
    dataDir: archive,
    readOnly: true,
    instanceToken: randomUUID(),
  };
  const server = createServer(async (request, response) => {
    const send = (code, value, type = 'application/json; charset=utf-8') => {
      response.writeHead(code, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET') return send(405, { error: '只读服务仅支持 GET' });
      if (url.pathname === '/api/health') return send(200, identity);
      if (url.pathname === '/api/interactions')
        return send(
          200,
          await readInteractions({
            workspace: root,
            dataDir: archive,
            teamId: url.searchParams.get('teamId'),
            after: url.searchParams.has('after') ? Number(url.searchParams.get('after')) : 0,
            limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 100,
            taskId: url.searchParams.get('taskId'),
            runId: url.searchParams.get('runId'),
            type: url.searchParams.get('type'),
          }),
        );
      const params = Object.fromEntries(
        ['projectId', 'rootSessionId', 'teamId', 'taskId', 'reference']
          .filter((key) => url.searchParams.has(key))
          .map((key) => [key, url.searchParams.get(key)]),
      );
      if (url.pathname === '/api/state') {
        return send(200, await readPortableState({ ...params, ...scope }));
      }
      if (url.pathname === '/api/artifact')
        return send(200, await readArtifact({ ...params, ...scope }));
      if (url.pathname === '/')
        return send(
          200,
          await readFile(htmlPath || (await defaultHtmlPath()), 'utf8'),
          'text/html; charset=utf-8',
        );
      return send(404, { error: '地址不存在' });
    } catch (error) {
      send(503, { error: error.message });
    }
  });
  server.identity = identity;
  return server;
}
export async function startWebServer(options = {}) {
  const server = await createWebServer(options);
  const port = options.port === undefined ? 43782 : options.port;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口必须为 0 至 65535');
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', done);
  });
  try {
    await saveServiceIdentity(server.identity, server.address().port);
  } catch (error) {
    server.close();
    throw error;
  }
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string' },
      'data-dir': { type: 'string' },
      port: { type: 'string' },
    },
  });
  try {
    const server = await startWebServer({
      workspace: values.workspace,
      dataDir: values['data-dir'],
      port: values.port === undefined ? undefined : Number(values.port),
    });
    console.log(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
