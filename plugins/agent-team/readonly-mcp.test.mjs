import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './server.mjs';
import { createSnapshotReader } from './web/sync-query.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('正式 MCP 仅提供只读快照和已关联产物预览，读取不改变原生任务', async (t) => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'readonly-mcp-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const registryPath = resolve(workspace, 'registry.json');
  await writeFile(
    registryPath,
    JSON.stringify({ 'local-projects': { test: { id: 'test-project', rootPaths: [workspace] } } }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({
    root: workspace,
    directory: resolve(workspace, 'events'),
    dataDir: resolve(workspace, 'tracking'),
    registryPath,
  });
  const client = new Client({ name: 'readonly-contract-test', version: '1' });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'get_agent_team_artifact',
      'get_agent_team_probe',
      'open_agent_team_probe',
    ]);
    assert.ok(tools.every((t) => t.annotations.readOnlyHint === true));
    const result = await client.callTool({ name: 'get_agent_team_probe', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.readOnly, true);
    assert.equal(result.structuredContent.schemaVersion, 1);
    assert.equal('execution' in result.structuredContent, false);
    assert.equal(result.structuredContent.scope, 'session');
    assert.equal(result.structuredContent.selectedRootSessionId, null);
    assert.deepEqual(result.structuredContent.snapshot.tasks, []);
    const project = result.structuredContent.projects.find(
      (p) => p.id === result.structuredContent.selectedProjectId,
    );
    assert.equal(project.hostId, 'local');
    assert.ok(project.projectId);
    const displayed = [],
      errors = [];
    const reader = createSnapshotReader({
      query: async (projectId) =>
        (await client.callTool({ name: 'get_agent_team_probe', arguments: { projectId } }))
          .structuredContent,
      onSnapshot: (value) => displayed.push(value),
      onError: (error) => errors.push(error),
    });
    await reader.select(project.projectId);
    assert.equal(errors.length, 0);
    assert.equal(displayed[0].selectedProjectId, project.id);
    assert.ok(tools.every((t) => t.inputSchema.properties.rootSessionId));
    assert.deepEqual(tools.find((t) => t.name === 'get_agent_team_artifact')._meta.ui.visibility, [
      'app',
    ]);
    const invalid = await client.callTool({
      name: 'get_agent_team_artifact',
      arguments: { rootSessionId: 'missing', taskId: 'missing', reference: 'AGENTS.md' },
    });
    assert.equal(invalid.isError, true);
    const scoped = await client.callTool({
      name: 'open_agent_team_probe',
      arguments: { rootSessionId: 'unobserved-test-session' },
    });
    assert.equal(scoped.structuredContent.selectedRootSessionId, 'unobserved-test-session');
    assert.equal(scoped.structuredContent.snapshot.coverage, 'unobserved');
    assert.deepEqual(scoped.structuredContent.snapshot.agents, []);
    const { resources } = await client.listResources();
    const resource = await client.readResource({ uri: resources[0].uri });
    assert.ok(resource.contents[0].text.includes('Agent Team'));
    assert.ok(!resource.contents[0].text.includes('approve_design'));
  } finally {
    await client.close();
    await server.close();
  }
});
