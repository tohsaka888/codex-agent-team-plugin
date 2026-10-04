import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const client = new Client({ name: 'final-poc-verifier', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  stderr: 'ignore',
});
const report = {
  checks: {},
  scope: '真实 MCP/执行服务与浏览器端到端测试；浏览器动作由测试代理执行，非真人身份认证验收',
};
try {
  await client.connect(transport);
  const tools = await client.listTools();
  report.checks.reviewToolAppOnly =
    JSON.stringify(
      tools.tools.find((t) => t.name === 'act_agent_team_probe')?._meta?.ui?.visibility,
    ) === '["app"]';
  const state = await client.callTool({ name: 'get_agent_team_probe', arguments: {} });
  report.checks.acceptancePersistedAcrossMcpRestart =
    state.structuredContent?.e2e?.status === 'accepted' &&
    state.structuredContent.e2e.acceptanceApproved;
  report.job = state.structuredContent?.e2e;
  const duplicate = await client.callTool({
    name: 'act_agent_team_probe',
    arguments: { action: 'start', requestId: 'final-duplicate-start' },
  });
  report.checks.duplicateExecutionBlocked = !!duplicate.isError;
  report.runtime = JSON.parse(
    await readFile(new URL('../../docs/research/runtime-probe.json', import.meta.url)),
  );
  report.crash = JSON.parse(
    await readFile(new URL('../../docs/research/crash-probe.json', import.meta.url)),
  );
  report.remote = JSON.parse(
    await readFile(new URL('../../docs/research/remote-runtime-probe.json', import.meta.url)),
  );
  report.checks.actualExecutionBelongsToUiJob = report.job?.id === report.runtime.jobId;
  report.checks.localExecutionPassed = report.runtime.ok;
  report.checks.crashRecoveryPassed = report.crash.ok;
  report.localE2ePassed = Object.values(report.checks).every(Boolean);
  report.allEnvironmentsPassed = report.localE2ePassed && report.remote.ok;
  report.conclusion =
    '核心需求可实施；SSH 模型执行受当前远程 401 授权阻断。新宿主内审批交互无自动化访问面，仅完成普通浏览器经真实 MCP 的交互闭环。';
} finally {
  await client.close();
  await transport.close();
}
await writeFile(
  new URL('../../docs/research/final-e2e-probe.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      checks: report.checks,
      localE2ePassed: report.localE2ePassed,
      allEnvironmentsPassed: report.allEnvironmentsPassed,
    },
    null,
    2,
  ),
);
if (!report.localE2ePassed) process.exitCode = 1;
