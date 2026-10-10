---
name: team-sync
description: 在已启用的 Agent Team 中同步工单、执行实例、活动、逐项验收及评审证据到只读 Kanban；适用于协调者和参与团队任务的子 Agent。
---

# 团队同步

普通回答保持自然语言。通过本技能自包含 Node 脚本记录事实，不要求把最终回复改成 JSON。先运行 `node <本技能路径>/scripts/sync.mjs --help` 核对当前命令。

协调者与成员共享明确的 workspace、data-dir、team-id、task-id。每次执行另有 run-id，宿主返回的真实身份另填 native-agent-id；不知道身份时保持缺失，不能用名字或自造 UUID 代替。

Codex run 明确填 `provider=codex`，并保留完整派生路径 `agent-name=/root/...`。宿主有真实 UUID 时及时补录；UUID 未提供时，看板只允许在同一已核对主会话内用唯一完整路径补充展示关联，重名、多 run 等歧义保持未关联。该投影不改写归档身份。原生回合状态可补充执行状态，但不自动推进业务阶段、依赖或人工验收。

协调者在分派前登记 team 和 task，包括目标、依赖及稳定验收项。派生成功后关联 run；委派中提供本 SKILL.md、脚本实际路径及上述标识，要求成员读取并查询核对，不依赖隐式匹配必然发生。优先可用预定义 Profile，动态实例同样接入。

新分派或续派的 run 使用 `--title` 回报该次执行的具体分工名称，另用 `--goal` 保存完整目标；不要复制父工单标题作为执行名称。名称缺失的历史记录在界面使用执行 goal，再缺失显示“执行 · runId”，不推测名称。更新状态时省略 title 会保留已有名称。

成员读取本指引后按[逐执行技能证据](references/skill-evidence.md)立即回报 read，实际应用后更新 applied，结束前用 read 逐项核对本 run.skills；不可用及不适用保留具体依据。开始、里程碑、结束时同步自己的 run/activity。逐项 acceptance 只更新对应 item-id；通过和失败必须给出真实 evidence、reported-by。结束执行不自动改变业务阶段，也不代表验收通过。

独立审查读取 team-review；涉及 UI 基线读取 team-ue。人工确认由协调者绑定实际用户原话、具体版本和呈交快照，成员不得以自己的通过报告代替用户确认。

先使用明确命令参数；较长正文可用 `--body-file`，序列化和验证由脚本处理。重试保留同一 event-id；同 id 不同内容会拒绝。显式 revision 较旧的增量不覆盖新状态；新修订与新事件标识分别管理。多人同步不同验收项不会覆盖整个清单。

每次单独同步或同一里程碑的同步批次结束后运行 read 查询核对任务、运行关联和证据。命令失败记录原因并有界重试；协调者可根据真实结果补录。中断未同步时保持未知/未同步，不能因时间经过认定失败或完成。脚本落盘正确不证明业务事实真实。

同一里程碑可在一个工具回合顺序同步多个操作，逐项检查结果，批次结束 read 一次核对涉及的实体；大快照保存到文件，只返回目标 team/task/run 的状态与缺口。按[有界团队执行](../agent-team/references/efficient-workflow.md)复用日志与运行入口，保留完整事实、依赖顺序及失败诊断。

计划工单登记为 queued；实际开始后才更新 running。完成每个业务工单或切入全流程复核前，同步对应 task 的真实阶段和证据，不能只更新 reviewer 的 run 而让前序工单永久停在 running。续派同一原生实例使用新的 run-id，关联当前 task-id，保留真实 UUID 或可核对完整路径；历史 run 不改成新任务。多个 Reviewer 并行时分别同步开始、活动和结束，全部结束前不能把整项复核当成执行完成。缺前序完成回报时看板显示“依赖完成状态未同步”，不会替协调者补造业务完成。

默认归档在目标 workspace 的 `.agent-team`；可配置 data-dir。脚本可以单独复制使用，不导入插件源码、不依赖 Codex 配置。独立 Web 指向同一 workspace/data-dir。Hooks仅可补充原生观察，无 Hooks 时也能运行完整业务追踪。


## 强制 AC 与人工结果验收

正式登记、分派、恢复及交付前读取[每张卡的强制验收合同](references/acceptance.md)。父工单和每个执行均须非空具体 AC；先原子登记再派生。编码必须有实际通过的单元测试 AC，UE 必须有具体版本原型用户确认。Agent 逐项自主验证并提交本卡当前版本证据；只为确需人工核验的功能添加人工项，写清入口、操作步骤和预期结果；无需人工核验的卡不添加通用确认项。执行结束、Agent Review 和人工验收独立，不能代替彼此。

## 真实交互事实

实际成功分派、发送Agent消息、接收回复或观察状态后，用 `interaction` 操作回报。执行及消息发送仍由宿主原生工具完成；同步不发送消息、不调度任务。失败操作记录真实失败摘要/状态，不把失败的发送伪装成已送达。协调者保存工具实际结果；成员同步自己的真实消息及回复，未知身份/接收者保持缺失，不按职责名称猜测。

每条交互用稳定 `messageId`、`type=dispatch|message|reply|status`，明确 `teamId`，以及已知的 `taskId/runId/fromRunId/toRunId`。`content` 保存实际公开正文（不写内部推理、密钥或未经授权的隐私），`source` 明确宿主原生工具/明确回报，`timestamp` 保存实际发生/观测时间；归档另记 `recordedAt`。回复填原消息 `replyTo`，原消息尚未回报时关联标未知，后来补齐可恢复。未知字段不能用自造宿主身份代替。

```text
node <本技能路径>/scripts/sync.mjs interaction --workspace <工程> --team-id <团队> --message-id <稳定消息ID> --type message --source <实际来源> --body-file <实际正文JSON>
```

长正文使用JSON body-file的content字段保留换行，不在shell内拼正文。重试复用eventId/messageId，已归档消息正文不可通过新ID覆盖同messageId；不同事实使用新messageId。`status`交互仅记录观察，不更新业务状态、run状态、AC或评审；实际状态更新仍使用run/task命令。同步后read核对事实；HTTP `/api/interactions?teamId=...&after=...` 以归档sequence增量查询，保存nextCursor，按团队/任务/run/type筛选。发生时间可乱序，游标使用归档顺序，重复无新归档；来源只代表声明，不是身份认证。不承诺恢复未同步历史。
