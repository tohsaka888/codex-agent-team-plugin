import { ingest } from './native-state.mjs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const directory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../.runtime/native-team/events',
);
let input = '';
const hookMode = process.argv.includes('--hook');
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 65536) throw new Error('回报超过大小限制');
  }
  const value = JSON.parse(input);
  await ingest(directory, value);
  // Hook 始终无输出，不注入上下文、不改变审批或执行。
} catch (error) {
  if (!hookMode) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
