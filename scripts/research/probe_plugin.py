"""读取安装后的插件详情和 MCP 清单；不运行模型。"""
import json
import queue
import shutil
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    p = subprocess.Popen([shutil.which('codex'), 'app-server', '--stdio'], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
    inbox = queue.Queue()
    def receive():
        for line in p.stdout:
            try: inbox.put(json.loads(line))
            except json.JSONDecodeError: pass
    threading.Thread(target=receive, daemon=True).start()
    def call(i, method, params):
        p.stdin.write(json.dumps({'id': i, 'method': method, 'params': params}) + '\n'); p.stdin.flush()
        while True:
            msg = inbox.get(timeout=30)
            if msg.get('id') == i:
                if 'error' in msg: return {'error': msg['error']}
                return msg.get('result', {})
    report = {}
    try:
        call(1, 'initialize', {'clientInfo': {'name': 'plugin_probe', 'version': '0.1.0'}, 'capabilities': {'experimentalApi': True}})
        p.stdin.write('{"method":"initialized"}\n'); p.stdin.flush()
        result = call(2, 'plugin/read', {'marketplacePath': str(ROOT / '.agents/plugins/marketplace.json'), 'pluginName': 'agent-team-probe'})
        if 'error' in result: report['pluginRead'] = result
        else:
            plugin = result.get('plugin', {})
            report['pluginRead'] = {k: plugin.get(k) for k in ['marketplaceName', 'mcpServers', 'apps', 'appTemplates']}
        status = call(3, 'mcpServerStatus/list', {'serverName': 'agent-team-probe', 'limit': 100})
        report['mcpStatus'] = status
        server = next((s for s in status.get('data', []) if s.get('name') == 'agent-team-probe'), {})
        opener = server.get('tools', {}).get('open_agent_team_probe', {})
        metadata = opener.get('_meta', {})
        entrypoints = metadata.get('openai/ui', {}).get('entrypoints', [])
        report['checks'] = {
            'installedMcpLoaded': 'agent-team-probe' in report.get('pluginRead', {}).get('mcpServers', []),
            'toolsDiscovered': bool(opener) and not server.get('toolsError'),
            'uiResourceDiscovered': any(r.get('uri') == metadata.get('ui', {}).get('resourceUri') and r.get('mimeType') == 'text/html;profile=mcp-app' for r in server.get('resources', [])),
            'globalMetadataPresent': {'type': 'global'} in entrypoints,
            'threadMetadataPresent': {'type': 'thread'} in entrypoints,
        }
        report['ok'] = all(report['checks'].values())
        report['scope'] = 'installed plugin discovery in a separate App Server; desktop rendering not verified'
    except queue.Empty: report['error'] = 'timeout after 30 seconds'
    finally:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill()
    (ROOT / 'docs/research/plugin-load-probe.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report.get(k) for k in ['ok', 'checks', 'scope', 'error']}, ensure_ascii=False))
    if not report.get('ok'): raise SystemExit(1)


if __name__ == '__main__': main()
