# 分派目标回报

协调者在成功 `spawn_agent` 后、修改目标的 `followup_task` 后执行此步骤。插件只保存展示元数据；原生记录可能加密，目标需要协调者明确回报。

1. 保存工具返回的真实子 Agent UUID，并核对父会话 UUID、实际执行主机和工作区。只有路径而没有 UUID 时先核对身份；尚未核对则标为回报待补，不用名称替代 UUID。
2. 将实际发送的任务目标写入 JSON 文件（UTF-8），字段见下面。`goal` 使用明确目标摘要，最长6000字符，保留写入范围及验收要点；不复制凭据或无关上下文。目标变更使用同一父会话/子 Agent ID，`goalOrigin` 改为 `followup`。
3. 在该执行主机运行本技能的 `scripts/report-goal.mjs`，通过 stdin 传入 JSON。PowerShell 使用 `Get-Content -Raw -LiteralPath <JSON路径> | node <脚本绝对路径>`；POSIX 使用 `node <脚本绝对路径> < <JSON路径>`。脚本位置相对本 SKILL.md；路径含空格时按实际 shell 引用。无需全局安装或新增 MCP 写入工具。
4. 调用只读 `get_agent_team_probe`，传入父会话 ID 和已核对项目 ID，确认对应真实 Agent 的目标及来源。保存成功不等于关联成功；无原生分派证据时保持待核对。回报失败记录原因，继续原生任务，后续补回报。

```json
{
  "cwd": "实际工作区绝对路径",
  "sessionId": "成功分派所属父会话UUID",
  "nativeAgentId": "工具返回的子Agent UUID",
  "goal": "实际发送的目标摘要，含范围与验收要点",
  "goalOrigin": "dispatch",
  "reportedBy": "协调者真实身份"
}
```

`hostId` 默认 `local`：指插件所在执行主机的本地数据，与该主机 MCP 目录一致；不要因为使用 SSH 就自行填 AI 主机别名。`observedAt` 可省略，由脚本记录回报时间。后续补录历史目标必须有明确证据；使用 `goalOrigin=linked-document` 并提供 `reference`，只录入能证明属于该真实实例的工单目标。当前脚本不自动读取文档。

回报只叠加到已关联的原生执行卡片，不改状态、评审或验收，不创建重复任务。已有业务 `task-report` 继续使用其任务目标；更新该业务工单时在原回报中明确提供 `goal`。
