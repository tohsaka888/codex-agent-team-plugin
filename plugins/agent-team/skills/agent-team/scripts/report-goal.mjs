import { ingest } from '../../../native-state.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 在插件自身的展示事件目录回报目标；与 MCP 查询使用同一目录。
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = resolve(plugin, '../../.runtime/native-team/events');
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 65536) throw new Error('回报超过大小限制');
  }
  await ingest(directory, { ...JSON.parse(input), kind: 'task-goal-report' });
  console.log('目标回报已保存；请通过只读看板查询核对关联。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
