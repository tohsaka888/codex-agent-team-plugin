"""只连接已有宿主控制 socket；不启动服务、模型、会话或 SSH。"""
import json
import queue
import shutil
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
report = {"scope": "existing app-server proxy only; no daemon start or model turns", "checks": []}
process = subprocess.Popen([shutil.which("codex"), "app-server", "proxy"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
messages = queue.Queue()
errors = []

def read():
    for line in process.stdout:
        try:
            messages.put(json.loads(line))
        except json.JSONDecodeError:
            pass
    messages.put({"exit": True})

def read_errors():
    for line in process.stderr:
        errors.append(line.strip())

threading.Thread(target=read, daemon=True).start()
threading.Thread(target=read_errors, daemon=True).start()

def call(n, method, params):
    process.stdin.write(json.dumps({"id": n, "method": method, "params": params}) + "\n")
    process.stdin.flush()
    while True:
        msg = messages.get(timeout=12)
        if msg.get("exit"):
            raise RuntimeError("proxy exited before response")
        if msg.get("id") == n:
            return msg

try:
    reply = call(1, "initialize", {"clientInfo": {"name": "native_control_readonly_probe", "version": "0.1"}, "capabilities": {"experimentalApi": True}})
    report["checks"].append({"method": "initialize", "ok": "result" in reply, "error": reply.get("error")})
    if "result" in reply:
        process.stdin.write(json.dumps({"method": "initialized"}) + "\n")
        process.stdin.flush()
        for n, method, params in [(2, "project/list", {"limit": 100}), (3, "thread/list", {"limit": 10}), (4, "thread/loaded/list", {})]:
            reply = call(n, method, params)
            result = reply.get("result", {})
            report["checks"].append({"method": method, "ok": "result" in reply, "error": reply.get("error"), "keys": list(result), "count": len(result.get("data", []))})
except Exception as error:
    report["connectionError"] = str(error)
finally:
    if process.poll() is None:
        process.terminate()
    process.wait(timeout=5)
    report["stderr"] = errors
    report["ok"] = bool(report["checks"]) and all(x["ok"] for x in report["checks"])
    output = ROOT / "docs/research/native-control-probe.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
