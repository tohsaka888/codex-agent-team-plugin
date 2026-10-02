import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ReviewGate } from './review-gate.mjs';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.runtime/probe');
const jobPath = resolve(directory, 'e2e-job.json');
const gatePath = resolve(directory, 'e2e-review.json');
let queue = Promise.resolve();
async function job() { try { return JSON.parse(await readFile(jobPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; return { status: 'not_started' }; } }
async function save(value) { await writeFile(jobPath + '.tmp', JSON.stringify(value, null, 2)); await rename(jobPath + '.tmp', jobPath); }
export async function e2eState() {
  await mkdir(directory, { recursive: true });
  const value = await job();
  const gate = await ReviewGate.open(gatePath);
  if (value.status === 'running') {
    let report;
    try { report = JSON.parse(await readFile(resolve(root, 'docs/research/runtime-probe.json'), 'utf8')); } catch {}
    if (report?.jobId === value.id) {
      value.status = report.ok ? 'awaiting_human_review' : 'failed';
      value.checks = report.checks;
      value.error = report.error;
    } else {
      try { process.kill(value.pid, 0); } catch { value.status = 'unknown'; value.error = '执行进程不可用，必须人工检查后恢复，不自动重跑'; }
    }
  }
  return { ...value, designApproved: gate.canImplement(), acceptanceApproved: gate.canAccept(), planVersion: gate.state.planVersion,
    deliveryVersion: gate.state.deliveryVersion, approvals: gate.state.approvals, reviewScope: 'POC 浏览器操作；无宿主账号身份认证，不批准真实工程交付' };
}
export function e2eAction(action, requestId) {
  const pending = queue.then(() => mutate(action, requestId));
  queue = pending.catch(() => {});
  return pending;
}
async function mutate(action, requestId) {
  await mkdir(directory, { recursive: true });
  const gate = await ReviewGate.open(gatePath);
  const value = await job();
  if (['approve_design', 'reject_design'].includes(action) && !['not_started'].includes(value.status)) throw new Error('已启动的 POC 不能改写方案批准');
  if (action === 'approve_design') {
    await gate.submit({ stage: 'design', version: gate.state.planVersion, decision: 'approved', reviewer: 'POC_BROWSER_ACTION', requestId });
  } else if (action === 'reject_design') {
    if (value.status === 'running') throw new Error('运行期间不能改写方案批准');
    await gate.submit({ stage: 'design', version: gate.state.planVersion, decision: 'rejected', reviewer: 'POC_BROWSER_ACTION', requestId });
  } else if (action === 'start') {
    if (!gate.canImplement()) throw new Error('请先评审并批准 POC 方案');
    if (value.status !== 'not_started') throw new Error('本 POC 已启动，禁止重复执行');
    const id = requestId;
    await save({ id, status: 'starting', startedAt: new Date().toISOString() });
    await writeFile(resolve(directory, 'execution.json'), JSON.stringify({ runs: [], events: [], status: '新 POC 执行启动中', scope: '页面通过 MCP 创建的隔离会话', jobId: id }));
    // 启动检查和执行结束分别记录，dispatch 不把启动误认为执行完成。
    const child = spawn('python', [resolve(root, 'scripts/research/runtime_probe.py')], { cwd: root, windowsHide: true, detached: true, stdio: 'ignore', env: { ...process.env, PROBE_JOB_ID: id, PROBE_SSH_HOST: '' } });
    await new Promise((yes, no) => { child.once('spawn', yes); child.once('error', no); });
    child.unref();
    await save({ id, pid: child.pid, status: 'running', startedAt: new Date().toISOString() });
  } else if (action === 'approve_release') {
    const current = await e2eState();
    if (current.status !== 'awaiting_human_review') throw new Error('执行证据未通过，不能验收');
    gate.state.executed = true;
    await gate.save();
    await gate.submit({ stage: 'release', version: gate.state.deliveryVersion, decision: 'approved', reviewer: 'POC_BROWSER_ACTION', requestId });
    await save({ ...value, checks: current.checks, status: 'accepted', acceptedAt: new Date().toISOString() });
  } else { throw new Error('Unknown POC action'); }
  return e2eState();
}
