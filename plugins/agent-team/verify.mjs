// 集成验证：MCP 发现、入口元数据、资源和真实 Workspace 数据。
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const client = new Client({ name: 'agent-team-verifier', version: '0.1.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], stderr: 'ignore' });
const report = { scope: 'direct MCP integration; not desktop UI', checks: [] };
try {
  await client.connect(transport);
  const inventory = await client.listTools();
  const opener = inventory.tools.find(t => t.name === 'open_agent_team_probe');
  report.checks.push({ name: 'tools/list', names: inventory.tools.map(t => t.name), metadata: opener?._meta });
  const resources = await client.listResources();
  const resource = await client.readResource({ uri: resources.resources[0].uri });
  report.checks.push({ name: 'resources/read', mimeType: resource.contents[0].mimeType, htmlBytes: Buffer.byteLength(resource.contents[0].text) });
  const result = await client.callTool({ name: 'open_agent_team_probe', arguments: {} });
  report.checks.push({ name: 'tools/call', isError: !!result.isError, projectCount: result.structuredContent?.projects?.length, selectedProjectId: result.structuredContent?.selectedProjectId, scope: result.structuredContent?.execution?.scope });
  report.ok = !!opener && !result.isError && resource.contents[0].mimeType === 'text/html;profile=mcp-app' && result.structuredContent?.projects?.length > 0;
  const projects = result.structuredContent?.projects || [];
  const remote = projects.filter(p => p.kind === 'remote');
  report.checks.push({ name: 'workspace inventory', localCount: projects.filter(p => p.kind === 'local').length, remoteCount: remote.length, uniqueKeys: new Set(projects.map(p => p.id)).size === projects.length });
  if (remote.length) {
    const selected = await client.callTool({ name: 'get_agent_team_probe', arguments: { projectId: remote[0].id } });
    const isolated = !selected.isError && selected.structuredContent?.selectedProjectId === remote[0].id && selected.structuredContent.execution.runs.length === 0;
    report.checks.push({ name: 'remote workspace selection excludes local probe runs', ok: isolated });
    report.ok &&= isolated;
  }
  report.ok &&= new Set(projects.map(p => p.id)).size === projects.length;
} catch(error) { report.ok = false; report.error = error.message; }
finally { await client.close(); await transport.close(); }
await writeFile(new URL('../../docs/research/mcp-probe.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
