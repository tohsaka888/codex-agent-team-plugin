// 原生团队只读入口；保留工具名以兼容现有本机安装。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
import { z } from 'zod';
import { readState } from './readonly-state.mjs';
import { readArtifact } from './artifact-reader.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const option = (name) => {
  const index = process.argv.indexOf('--' + name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('缺少 --' + name + ' 参数');
  return value;
};
const root = resolve(
  option('workspace') || process.env.AGENT_TEAM_WORKSPACE || resolve(here, '../..'),
);
const dataDir = option('data-dir') || process.env.AGENT_TEAM_DATA_DIR;
const portable = process.argv.includes('--portable') || process.env.AGENT_TEAM_MODE === 'portable';
const directory = resolve(root, '.runtime/native-team/events');
const uiUri = 'ui://agent-team/session-readonly-v050.html';
const icons = [
  {
    src:
      'data:image/svg+xml;base64,' +
      Buffer.from(await readFile(resolve(here, 'assets/team.svg'))).toString('base64'),
    mimeType: 'image/svg+xml',
    sizes: ['any'],
  },
];
const state = (projectId, rootSessionId, autoSelectSession = false) =>
  readState({
    projectId,
    rootSessionId,
    root,
    directory,
    autoSelectSession,
    dataDir,
    portable,
    currentSessionId: process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID,
  });
export function createMcpServer(context = {}) {
  const query = (projectId, rootSessionId, autoSelectSession = false) =>
    readState({
      root,
      directory,
      dataDir,
      portable,
      currentSessionId: process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID,
      ...context,
      projectId,
      rootSessionId,
      autoSelectSession,
    });
  const server = new McpServer({ name: 'agent-team', version: '0.5.0', icons });
  registerAppTool(
    server,
    'open_agent_team_probe',
    {
      title: '打开 Agent Team 看板',
      description:
        '查看指定主会话及其子 Agent 的团队看板。启用团队由插件 Skill 和原生协调者完成，本工具只读。',
      inputSchema: { projectId: z.string().optional(), rootSessionId: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: uiUri }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
    },
    async ({ projectId, rootSessionId }) => ({
      content: [
        { type: 'text', text: 'Agent Team 只读视图；仅展示已接入的原生数据与明确任务回报。' },
      ],
      structuredContent: await query(projectId, rootSessionId, true),
    }),
  );
  server.registerTool(
    'get_agent_team_probe',
    {
      description: '只读刷新团队展示快照，不执行模型回合。',
      inputSchema: {
        projectId: z.string().optional(),
        rootSessionId: z.string().optional(),
        autoSelectSession: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ projectId, rootSessionId, autoSelectSession }) => ({
      content: [{ type: 'text', text: '已读取团队展示快照。' }],
      structuredContent: await query(projectId, rootSessionId, autoSelectSession),
    }),
  );
  server.registerTool(
    'get_agent_team_artifact',
    {
      description: '仅供看板查看当前会话已关联的工作区文件，不执行任务。',
      inputSchema: {
        projectId: z.string().optional(),
        rootSessionId: z.string(),
        taskId: z.string(),
        reference: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ['app'] } },
    },
    async (params) => {
      try {
        return {
          content: [{ type: 'text', text: '已读取产物预览。' }],
          structuredContent: await readArtifact({
            root,
            directory,
            dataDir,
            portable,
            ...context,
            ...params,
          }),
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  );
  registerAppResource(server, 'Agent Team', uiUri, {}, async () => ({
    contents: [
      {
        uri: uiUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(resolve(here, 'dist/board.html'), 'utf8'),
        _meta: {
          ui: { prefersBorder: false },
          'openai/ui': { availableDisplayModes: ['fullscreen', 'inline'] },
        },
      },
    ],
  }));
  return server;
}
if (process.argv.includes('--http')) {
  const host = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      if (url.pathname === '/api/state') {
        const value = await state(
          url.searchParams.get('projectId') || undefined,
          url.searchParams.get('rootSessionId') || undefined,
          url.searchParams.get('autoSelectSession') === 'true',
        );
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify(value));
        return;
      }
      if (url.pathname === '/api/artifact') {
        const value = await readArtifact({
          projectId: url.searchParams.get('projectId') || undefined,
          rootSessionId: url.searchParams.get('rootSessionId'),
          taskId: url.searchParams.get('taskId'),
          reference: url.searchParams.get('reference'),
          root,
          directory,
          dataDir,
          portable,
        });
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(JSON.stringify(value));
        return;
      }
      if (url.pathname !== '/') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(await readFile(resolve(here, 'dist/board.html'), 'utf8'));
    } catch (error) {
      if (!response.headersSent)
        response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  host.listen(Number(process.env.AGENT_TEAM_PREVIEW_PORT || 43782), '127.0.0.1', () =>
    console.error('只读预览已启动：http://127.0.0.1:' + host.address().port),
  );
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createMcpServer().connect(new StdioServerTransport());
}
