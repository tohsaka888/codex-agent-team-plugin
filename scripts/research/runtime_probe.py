"""阶段 0 真实执行验证；只操作本脚本创建的隔离会话，不指定模型。"""
import json
import queue
import shutil
import subprocess
import threading
import time
import uuid
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / '.runtime/probe'
RUNTIME.mkdir(parents=True, exist_ok=True)
REMOTE_HOST = os.environ.get('PROBE_SSH_HOST')
REPORT = ROOT / ('docs/research/remote-runtime-probe.json' if REMOTE_HOST else 'docs/research/runtime-probe.json')
events, runs = [], []
SNAPSHOT_NAME = os.environ.get('PROBE_SNAPSHOT_NAME') or ('remote-execution.json' if REMOTE_HOST else 'execution.json')


def snapshot():
    path = RUNTIME / SNAPSHOT_NAME
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps({'runs': runs, 'events': events, 'scope': '真实 App Server 隔离验证会话；非原生聊天接管', 'status': '验证中'}, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


class Rpc:
    def __init__(self):
        self.seq = 0
        self.inbox = queue.Queue()
        command = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', REMOTE_HOST, "zsh -lic 'exec codex app-server --stdio'"] if REMOTE_HOST else [shutil.which('codex'), 'app-server', '--stdio']
        self.p = subprocess.Popen(command, cwd=ROOT,
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 text=True, encoding='utf-8')
        def receive():
            for line in self.p.stdout:
                try: self.inbox.put(json.loads(line))
                except json.JSONDecodeError: pass
        threading.Thread(target=receive, daemon=True).start()
        self.call('initialize', {'clientInfo': {'name': 'agent_team_execution_probe', 'version': '0.1.0'}, 'capabilities': {'experimentalApi': True}})
        self.send({'method': 'initialized'})

    def send(self, value):
        self.p.stdin.write(json.dumps(value) + '\n')
        self.p.stdin.flush()

    def next(self, timeout=45):
        msg = self.inbox.get(timeout=timeout)
        if 'method' in msg:
            if 'id' in msg:
                self.send({'id': msg['id'], 'error': {'code': -32601, 'message': 'Probe does not permit interactive tools'}})
            else: capture(msg)
        return msg

    def call(self, method, params):
        self.seq += 1
        request_id = self.seq
        self.send({'id': request_id, 'method': method, 'params': params})
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            msg = self.next(max(1, deadline - time.monotonic()))
            if msg.get('id') == request_id:
                if 'error' in msg: raise RuntimeError(method + ': ' + str(msg['error']))
                return msg.get('result', {})
        raise TimeoutError(method)

    def close(self):
        self.p.stdin.close()
        try: self.p.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.p.terminate()
            self.p.wait(timeout=5)


def capture(msg):
    method, params = msg['method'], msg.get('params', {})
    thread_id = params.get('threadId')
    run = next((r for r in runs if r.get('threadId') == thread_id), None)
    if not run: return
    if method in ['turn/started', 'turn/completed', 'item/started', 'item/completed', 'error']:
        item = params.get('item', {})
        event = {'at': time.time(), 'method': method, 'taskId': run['taskId'], 'threadId': thread_id,
                 'turnId': params.get('turnId') or params.get('turn', {}).get('id'), 'itemType': item.get('type')}
        event['itemId'] = item.get('id')
        if method == 'turn/started':
            run.update(status='running', startedAt=event['at'])
        if item.get('type') == 'commandExecution':
            event['exitCode'] = item.get('exitCode')
            run['currentActivity'] = '执行隔离验证命令' if method == 'item/started' else '命令执行结束'
        if method == 'item/completed' and item.get('type') == 'agentMessage':
            run['output'] = item.get('text', '')
        if method == 'turn/completed':
            status = params.get('turn', {}).get('status')
            event['status'] = status
            run.update(status={'completed': 'completed', 'interrupted': 'interrupted'}.get(status, 'failed'), endedAt=event['at'])
            run['turnStatus'] = status
            run['currentActivity'] = '执行已结束，尚未人工验收'
            if params.get('turn', {}).get('error'): run['error'] = params['turn']['error']
        if method == 'error': event['error'] = params.get('message') or params.get('error')
        events.append(event)
        snapshot()


def wait_until(rpc, condition, timeout=180):
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline: raise TimeoutError('execution event deadline')
        try: rpc.next(min(15, max(1, deadline - time.monotonic())))
        except queue.Empty: print('等待执行事件…', flush=True)


def start_turn(rpc, run, text):
    run.update(status='queued', output='')
    result = rpc.call('turn/start', {'threadId': run['threadId'], 'input': [{'type': 'text', 'text': text, 'text_elements': []}]})
    run['turnId'] = result['turn']['id']
    snapshot()


def main():
    rpc = None
    report = {'scope': ('SSH AI 远程' if REMOTE_HOST else '本机') + ' App Server 自建会话；只读隔离命令；继承默认模型', 'jobId': os.environ.get('PROBE_JOB_ID'), 'checks': {}}
    nonce = 'PROBE_' + uuid.uuid4().hex[:12]
    try:
        rpc = Rpc()
        for index, total in [('A', 17), ('B', 23)]:
            cwd = RUNTIME / ('run-' + index.lower())
            cwd.mkdir(exist_ok=True)
            (cwd / 'fixture.txt').write_text(f'{nonce}_{index}_{total}', encoding='utf-8')
            execution_cwd = str(cwd)
            if REMOTE_HOST:
                execution_cwd = '/tmp/codex-agent-team-poc-' + nonce + '-' + index
                payload = json.dumps({'path': execution_cwd, 'text': f'{nonce}_{index}_{total}'})
                setup = "import json,pathlib; d=json.loads(" + repr(payload) + "); p=pathlib.Path(d['path']); p.mkdir(); (p/'fixture.txt').write_text(d['text'])"
                import base64
                encoded = base64.b64encode(setup.encode()).decode()
                subprocess.run(['ssh', '-o', 'BatchMode=yes', REMOTE_HOST, "python3 -c \"import base64;exec(base64.b64decode('" + encoded + "'))\""], check=True, timeout=20)
            result = rpc.call('thread/start', {'cwd': execution_cwd, 'ephemeral': index == 'B', 'sandbox': 'read-only', 'approvalPolicy': 'never',
                'developerInstructions': '这是隔离连接能力测试。只读当前目录 fixture.txt，不读其他项目，不调用网络、插件、子 agent，不修改文件。按请求执行命令并返回结果。'})
            thread = result['thread']
            runs.append({'taskId': 'probe-' + index, 'title': '真实并行只读验证 ' + index, 'agent': '验证执行者 ' + index,
                         'threadId': thread['id'], 'parentThreadId': thread.get('parentThreadId'), 'status': 'queued', 'cwd': execution_cwd, 'hostId': 'remote-ssh-discovered:AI' if REMOTE_HOST else 'local'})
        # 两个 turn 均先发送，再等待完成。命令停留 8 秒便于采集重叠区间。
        for run in runs:
            command = 'cat fixture.txt; sleep 8' if REMOTE_HOST else 'Get-Content -Raw fixture.txt; Start-Sleep -Seconds 8'
            start_turn(rpc, run, '使用终端执行命令：' + command + '。最后逐字返回 fixture.txt 的原始文字内容（以 PROBE_ 开头），不要计算哈希，不要计算校验和，不要解释。')
        wait_until(rpc, lambda: all(r['status'] in ['completed', 'failed', 'interrupted'] for r in runs))
        original = [dict(r) for r in runs]
        commands = [e for e in events if e['itemType'] == 'commandExecution']
        overlap = min(r.get('endedAt', 0) for r in runs) - max(r.get('startedAt', float('inf')) for r in runs)
        report['parallelRuns'] = original
        report['checks']['bothOutputsCorrect'] = all(f'{nonce}_{x}_{n}' in runs[i].get('output', '') and runs[i]['status'] == 'completed' for i, (x, n) in enumerate([('A',17),('B',23)]))
        report['checks']['overlappingTurns'] = overlap > 0
        report['overlapSeconds'] = max(0, overlap)
        report['checks']['commandEventsForBothTasks'] = all(any(e['taskId'] == r['taskId'] and e['method'] == 'item/completed' and e.get('exitCode') == 0 for e in commands) for r in runs)
        intervals = []
        for event in commands:
            if event['method'] != 'item/started': continue
            end = next((e for e in commands if e['itemId'] == event['itemId'] and e['method'] == 'item/completed'), None)
            if end: intervals.append((event['taskId'], event['at'], end['at']))
        command_overlap = max([min(a[2], b[2]) - max(a[1], b[1]) for a in intervals for b in intervals if a[0] != b[0]] or [0])
        report['commandOverlapSeconds'] = max(0, command_overlap)
        report['checks']['overlappingCommands'] = command_overlap > 0
        print('并行阶段：' + json.dumps(report['checks'], ensure_ascii=False), flush=True)
        if any(r['status'] != 'completed' for r in runs):
            raise RuntimeError('Model execution failed: ' + json.dumps([r.get('error') for r in runs], ensure_ascii=False))

        run = runs[0]
        start_turn(rpc, run, '使用终端执行 ' + ('sleep 60' if REMOTE_HOST else 'Start-Sleep -Seconds 60') + '，命令结束后返回 WAIT_DONE。这是中断能力测试。')
        wait_until(rpc, lambda: any(e['turnId'] == run['turnId'] and e['method'] == 'item/started' and e['itemType'] == 'commandExecution' for e in events), timeout=100)
        rpc.call('turn/interrupt', {'threadId': run['threadId'], 'turnId': run['turnId']})
        wait_until(rpc, lambda: run['status'] in ['interrupted', 'failed', 'completed'], timeout=30)
        report['checks']['interruptAcknowledged'] = run['status'] == 'interrupted'
        rpc.close()
        rpc = None
        run['status'] = 'unknown'
        run['currentActivity'] = '验证驱动器已断开，等待恢复'
        snapshot()
        rpc = Rpc()
        resumed = rpc.call('thread/resume', {'threadId': run['threadId'], 'cwd': run['cwd'], 'sandbox': 'read-only', 'approvalPolicy': 'never'})
        report['checks']['sameThreadResumedAfterServerRestart'] = resumed['thread']['id'] == run['threadId']
        start_turn(rpc, run, '不要调用任何工具。只从本会话历史返回你最初读到的 fixture.txt 原始文字（以 PROBE_ 开头）。不要计算哈希或校验和。')
        wait_until(rpc, lambda: run['status'] in ['completed', 'failed', 'interrupted'], timeout=120)
        report['checks']['historyRetainedAfterRestart'] = f'{nonce}_A_17' in run.get('output', '') and run['status'] == 'completed'
        report['checks']['recoveryDoesNotReexecuteCommand'] = not any(e['turnId'] == run['turnId'] and e['itemType'] == 'commandExecution' for e in events)
        report['ok'] = all(report['checks'].values())
    except Exception as error:
        report.update(ok=False, error=str(error))
        if rpc:
            for run in runs:
                if run['status'] == 'running' and run.get('turnId'):
                    try: rpc.call('turn/interrupt', {'threadId': run['threadId'], 'turnId': run['turnId']})
                    except Exception: pass
                    run['status'] = 'unknown'
    finally:
        if rpc: rpc.close()
        snapshot()
        report['finalRuns'] = runs
        report['events'] = events
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({k: report.get(k) for k in ['ok', 'checks', 'error']}, ensure_ascii=False), flush=True)
    if not report.get('ok'): raise SystemExit(1)


if __name__ == '__main__': main()
