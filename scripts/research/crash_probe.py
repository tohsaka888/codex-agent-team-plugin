"""强杀本脚本创建的 App Server 树，检查持久会话能否恢复；不重放命令。"""
import json
import subprocess
import time
from pathlib import Path
import runtime_probe as runtime
runtime.SNAPSHOT_NAME = 'crash-execution.json'

report = {'scope': 'Windows 测试专用进程树强杀；不是桌面 App 强杀', 'checks': {}}
rpc = None
try:
    rpc = runtime.Rpc()
    cwd = runtime.RUNTIME / 'crash'
    cwd.mkdir(exist_ok=True)
    result = rpc.call('thread/start', {'cwd': str(cwd), 'sandbox': 'read-only', 'approvalPolicy': 'never',
        'developerInstructions': '隔离崩溃验证，不使用网络、插件、子 agent，不写文件。'})
    run = {'taskId': 'crash-test', 'threadId': result['thread']['id'], 'status': 'queued'}
    runtime.runs.append(run)
    runtime.start_turn(rpc, run, '先记住 CRASH_MEMORY_9137，然后使用终端执行 Start-Sleep -Seconds 60。这是崩溃测试。')
    runtime.wait_until(rpc, lambda: any(e['itemType'] == 'commandExecution' and e['method'] == 'item/started' for e in runtime.events), timeout=100)
    pid = rpc.p.pid
    subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rpc.p.wait(timeout=10)
    report['checks']['testProcessTreeKilled'] = rpc.p.returncode is not None
    rpc = None
    run['status'] = 'unknown'
    rpc = runtime.Rpc()
    resumed = rpc.call('thread/resume', {'threadId': run['threadId'], 'cwd': str(cwd), 'sandbox': 'read-only', 'approvalPolicy': 'never'})
    report['checks']['sameThreadRestored'] = resumed['thread']['id'] == run['threadId']
    old_events = len(runtime.events)
    runtime.start_turn(rpc, run, '不要调用工具。只返回本会话前一轮要求你记住的 CRASH_MEMORY_ 开头字符串。不要重跑任何命令。')
    runtime.wait_until(rpc, lambda: run['status'] in ['completed', 'failed', 'interrupted'], timeout=100)
    report['checks']['priorInputRecovered'] = 'CRASH_MEMORY_9137' in run.get('output', '') and run['status'] == 'completed'
    report['checks']['commandNotReplayed'] = not any(e['itemType'] == 'commandExecution' for e in runtime.events[old_events:])
    report['ok'] = all(report['checks'].values())
except Exception as error:
    report.update(ok=False, error=str(error))
finally:
    if rpc: rpc.close()
    report['events'] = runtime.events
    (runtime.ROOT / 'docs/research/crash-probe.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report.get(k) for k in ['ok','checks','error']}, ensure_ascii=False))
