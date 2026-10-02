"""只读可行性探针：不启动模型 turn，不安装插件，不输出聊天内容或凭据。"""
import json
import queue
import shutil
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    process = subprocess.Popen(
        [shutil.which("codex"), "app-server", "--stdio"],
        cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
    )
    messages = queue.Queue()

    def reader():
        for line in process.stdout:
            try:
                messages.put(json.loads(line))
            except json.JSONDecodeError:
                pass

    threading.Thread(target=reader, daemon=True).start()
    report = {"scope": "read-only; no thread/start, resume or turn/start", "results": []}

    def send(message):
        process.stdin.write(json.dumps(message) + "\n")
        process.stdin.flush()

    def request(request_id, method, params):
        send({"id": request_id, "method": method, "params": params})
        while True:
            message = messages.get(timeout=20)
            if message.get("id") == request_id:
                if "error" in message:
                    result = {"method": method, "ok": False, "errorCode": message["error"].get("code"), "error": message["error"].get("message")}
                else:
                    payload = message.get("result", {})
                    result = {"method": method, "ok": True, "resultKeys": list(payload)}
                    if "data" in payload:
                        result["returnedCount"] = len(payload["data"])
                        result["hasMore"] = bool(payload.get("nextCursor"))
                        if payload["data"]:
                            result["itemKeys"] = list(payload["data"][0])
                report["results"].append(result)
                return result

    try:
        initialized = request(1, "initialize", {"clientInfo": {"name": "agent_team_feasibility", "version": "0.0.0"}, "capabilities": {"experimentalApi": True}})
        if initialized["ok"]:
            send({"method": "initialized"})
            request(2, "project/list", {"limit": 1})
            request(3, "thread/list", {"limit": 1, "cwd": str(ROOT), "useStateDbOnly": True})
    except queue.Empty:
        report["error"] = "response timeout after 20 seconds"
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    output = ROOT / "docs" / "research" / "local-probe.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
