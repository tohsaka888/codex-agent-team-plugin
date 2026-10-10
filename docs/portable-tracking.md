# 可移植追踪合同

规格与四条工单 v2 已获用户明确确认，版本和指纹见 .scratch 评审记录（本机记录：`../.scratch/profile-native-refactor/review-v2.md`）。当前执行仍使用宿主原生工具；追踪核心不调度模型、不认证用户、不控制批准。

## 执行与同步

`setup-agent-team` 是显式环境安装入口；日常任务不重复预检，仅在实际遇到缺失依赖时补齐受影响项。入口 `agent-team` 管理工程流程；`team-sync` 封装同步脚本；`team-review` 保存审查及复查；`team-ue` 管理 UI 基线。协调者在分派前登记 Task，派生后关联 AgentRun；成员收到实际路径及稳定标识后读取 Skill 并同步。正常最终回复不要求 JSON，内部事件仍是结构化协议。

预定义 Profile 优先选择，宿主工具实际支持的 agent_type 与职责分别核对；动态角色同样参与。安装 Profile 不代表已经派生成功，发现 Skill 不代表实际读取，读取也不等于脚本执行。通用 agentId 仅用于展示关联，不填入 nativeAgentId 冒充原生身份。

## 业务与证据

Task 可以没有任何 run；一张 Task 可以关联多次开发、审查和返工。业务状态独立于运行状态，运行结束不自动完成 Task，不自动通过 checklist，也不自动确认设计。

2026-10-04 状态投影修正：明确进行中的 task 或已开始的 run 不因前序完成回报缺失而被改成自动阻塞，改为独立显示依赖同步提示；未开始的 queued task 仍检查依赖，显式 blocked/评审/返工阶段保持原意。业务 running 但没有 run 时显示“业务进行中 · 执行未同步”。多实例并行以各实例最近 run 聚合：有运行者保持进行中，失败/中断不会被另一个已完成实例掩盖，同实例后续修复替换其旧失败。原生补充不能覆盖已结束 run 的历史活动。

验收项按稳定 item-id 合并，通过/失败需具体证据与报告者。review-requirement 从工作区实际文件计算 SHA256 并保存不可覆盖快照；review 保存明确对象、版本、指纹、用户原话或 Agent 结论。人工记录要求声明协调者及实际用户依据，但这不是身份认证。新版不继承旧指纹确认；部分确认只作用于对应对象。

## 存储与边界

默认工作区 `.agent-team` 归档，允许显式 data-dir；不同真实工作区即使共用 data-dir 也有独立范围。事件协议版本、稳定 event-id、producer、sequence、revision 和时间均保存。独占写锁与原子发布避免并发半写；同 event-id 同内容可重试，不同内容拒绝。实体旧 revision 不覆盖新修订；条目逐项更新，不覆盖其他验收项。

写进程意外退出可能留下锁；脚本超时报出具体路径，确认没有写入者后再处理，不自动删除未知锁。同步命令失败和中断未同步应明确回报，不假报已完成。当前为本地事件归档，没有跨主机实时写入服务。

## 只读展示与兼容

内嵌 MCP 与独立 HTTP 共用快照、四列看板、详情及组织图。独立模式只读明确工作区，不依赖 Codex home/SQLite；没有真实客户端导航能力时不构造 Codex 深链。旧事件保持原文件读取，不补造旧记录已经丢失的多执行历史。

Hooks 是可选观察增强。不同客户端的原生工具、技能发现与生命周期能力各自核验；隐式匹配不能保证每次执行。安装和使用命令见 [README](../README.md)，未实测客户端不得声明已完整适配。


## 强制 AC（2026-10-04 v1）

按用户确认的强制验收合同，每张父工单与独立执行卡在登记/分派时都必须有非空 AC，明确角色、类别、AC 版本和验证方法。编码类 taskType=code 必需 unit_test，UE 必需 human prototype；每卡还需 human delivery。Agent 自主验证当前结果，独立审查与人工结果验收分别记录。完整字段和可执行命令见[同步验收合同](../plugins/agent-team/skills/team-sync/references/acceptance.md)。

result 操作登记实际结果文件/版本/指纹；acceptance、review-requirement、review、artifact 的可选 runId 指定执行卡，不传则指定父工单。同名 AC 不跨卡合并。AC/目标/结果或已关联文件变化使旧证据失效，历史保留。业务 completed 要求每张关联卡当前验收满足；run completed 仍仅表示执行结束。旧数据可读，缺失标“AC 缺失 · 待补齐”，不追认人工通过。UI 显示每卡条件、验证进度、人工结果状态，原生执行结束且未验收进入待评审；完成列表示“验收完成”。


2026-10-04 人工核验细化（覆盖旧版每卡人工确认约定）：每卡仍须非空具体 AC 和 Agent 自验证；仅需人工核验的功能添加 human 条件，manualCheck 必填 entry、steps、expected。无需人工核验的卡不添加通用确认项，显示“无需人工核验”。UE 原型确认等适用要求保留；不得删除真实人工核验需求规避验收。详见 [强制验收合同](../plugins/agent-team/skills/team-sync/references/acceptance.md)。

## 独立网页与通用交互事件（2026-10-09）

独立分发目录dist/web只有Node内置运行依赖；browser bridge不包含MCP。启动器核对workspace/data-dir及本机已登记随机实例标识，未知服务拒绝复用。这是防误打开的本机绑定，不是跨用户认证系统；仅监听127.0.0.1。数据目录默认沿用AGENT_TEAM_DATA_DIR或workspace/.agent-team。teamId URL/API精确选单团队，即使多个团队关联同一宿主rootSessionId；旧MCP的session合并语义保留。

新增interaction操作：messageId稳定且不可变，type为dispatch/message/reply/status，content为实际公开正文（上限1 MiB），source必填；fromRunId/toRunId/taskId/runId未知时可缺失，reply必须replyTo。timestamp为实际发生/观测时间，recordedAt为归档时间，sequence为工作区归档顺序。eventId重试与messageId重复不产生新事实，同messageId不同正文拒绝，原消息迟到可恢复回复关联。status观察不推进业务/执行/验收。

独立HTTP只读GET /api/interactions?teamId=ID&after=0&limit=100，可选taskId/runId/type。返回interactions、nextCursor、hasMore；limit 1–500，after非负整数。顺序按sequence，分页及断线恢复从nextCursor继续；各workspace归档隔离，team过滤不会暴露其他团队正文。from/to身份与task/reply可用性明确known/unknown，不按名称猜测。正文/来源来自明确回报，仅声明而非身份认证。timeline-v1两图/UX已获用户确认，正式时间线及实际UI Check已通过，详见 [UI Check](ue/web-decoupling/ui-check/result-v1/ui-check.md)。本协议只展示明确接入的事件，不代表完整宿主历史已采集；01/04人工产品验收独立保留。
