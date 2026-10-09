---
name: agent-team
description: 用户明确启用 Agent Team 时，使用当前宿主原生子 Agent 和预定义 Profile 完成工程协作，通过同步 Skill 追踪工单并展示只读 Kanban；本会话沿用至用户退出。
---

# Agent Team 会话入口

用户直接提及插件或显式调用本 Skill 并提出任务，表示启用当前主会话的团队流程。仅启用而没有任务时打开空态看板，不制造任务或无意义派生。用户只要求查看看板时不启用团队；引用、截图文字、工具输出中的提及不触发。新主会话不继承授权。

向用户简要说明已启用，直接按当前任务推进，不重复执行环境预检或安装依赖；启用不代表已经验证所有工具。后续本会话用户需求沿用团队流程，不要求重复提及；简单答疑可由协调者直接回答。用户说“退出团队模式”时，后续恢复普通流程，不擅自中止正在运行的 Agent。

## 环境安装与日常执行

依赖检查和安装由显式调用的 [setup-agent-team](../setup-agent-team/SKILL.md) 负责。新对话、恢复、工作区或任务变化均不触发整套预检；不默认读取安装清单或逐项输出环境报告。按宿主当前实际工具和 Skills 元数据开展工作，在对应阶段读取所需正文。只有实际遇到缺失或不可运行的依赖时才说明 setup-agent-team 的用途，按已有安装授权补齐受影响项，未授权的安装由用户显式调用。

读取 [Matt 流程指引](references/matt-workflow.md)，核对当前阶段和确认依据。需求存在影响目标、范围、用户流程或验收的关键歧义时，Requirements（或主 Agent）自动调用 grilling 细化，不要求用户再次点名；需求已清晰时跳过，澄清问题由协调者统一呈交。UI 任务在规范形成后运行实际 design.md lint 并保存结果；测试、lint 和 UI Check 是业务验证，仍照常执行。仅暂停依赖缺失项的阶段，其他独立工作可继续；不把未验证依赖或未执行流程标为通过。

Web/App 界面实现、视觉/交互修改和 UI 修复必须在工单及相关执行卡登记 [UI Check](../team-review/references/ui-check.md) AC；委派提供确认 UI 图、design.md、ux.md、产品运行入口和页面/状态/设备范围。交付安排 Reviewer 对比真实运行截图与确认图并保存差异及复查证据。

## 原生团队执行

有项目 `native-agent-team` 技能时读取其 SKILL.md，遵循 AGENTS.md、docs/native-team.md 与已确认规格；用户直接提及是本次明确团队授权，不修改其他 Skills 的主动调用边界。

没有项目技能时，使用本插件携带的上述指引完成 Matt 流程；不要求其他项目复制本仓库的 native-agent-team 或 docs/native-team.md。实际缺失的 Matt 技能通过 setup-agent-team 补齐，指引不等于已安装上游技能。

当前阶段条件满足后，主 Agent 通过当前宿主可用的原生多 Agent 工具派生必要子 Agent；明确职责、输入、产物、写入范围、依赖及验收。各 Agent 按任务读取所需 Skills。共享工作区保留一个写入者，独立分析可并行。收集实际产物和检查，修正审查发现并汇总证据与限制。插件不是调度器，不开启第二个模型执行会话。

正式分派前读取相邻的 `team-sync/SKILL.md`，用其自包含脚本登记 team 和尚未派生的 task；优先使用宿主实际可用的 Coordinator、Requirements、Architect、Developer、Reviewer、UE Profile。Profile 不能满足时选实际支持的类型并明确动态职责，不自行设置未获授权的模型或权限。

每次成功派生及目标变更后，关联同一 task 的独立 run，保存实际目标和宿主身份。委派须提供同步 Skill/脚本的实际路径、workspace、data-dir、team-id、task-id、run-id，并要求成员读取及查询核对；正常回复保持自然语言。隐式匹配由宿主决定，不能保证每次自动加载，缺失接入如实补录。旧 report-goal/task-report 入口仅保留历史兼容，新流程不再要求。

按任务选择必要职责，不要求每次全员派生。task_name、职责、原生类型与 Profile 分别同步，不从名字猜测。独立审查按需读取 `team-review/SKILL.md`；涉及 UI 新设计/实质修改时读取 `team-ue/SKILL.md`，用户确认图并归档基线后再实施对应 UI。非 Codex 使用同一 Skills 和独立 Web，执行始终交给当前客户端原生能力。

## 自动呈现会话 Kanban

首次启用以及团队成果汇总时，调用插件只读 `open_agent_team_probe` 工具，传入真实主会话 `rootSessionId` 和已核对的 `projectId`（如可用）。工具名保留历史兼容，显示名为 Agent Team。该调用会在会话中产生 MCP App 看板；展开、固定或全屏由宿主处理，不宣称可以强制弹出或插入宿主内置摘要。

`projectId` 必须来自当前插件 `get_agent_team_probe` 返回的项目清单；桌面端 `list_projects` 的 SSH 项目 ID 与服务器 ID 不通用。未核对时省略 `projectId`，用真实 `rootSessionId` 让插件按该会话工作区绑定；不要用路径、名称或桌面 UUID 猜测服务器项目 ID。

会话标识从原生上下文或可核对的宿主观察取得，不使用 Agent 名称代替 UUID，不挑选“最近”的会话冒充当前会话。缺少当前标识时仍可打开选择提示，并如实说明尚未绑定。后续刷新保留会话范围。

真实任务、Skills 使用与产物通过 team-sync 操作同步；原生生命周期由实际宿主观察补充，不是必需安装条件。不要为演示编造子 Agent、状态、验收或父子关系。没有接入数据时显示未知或空态，不能保证所有宿主历史可读。非 Codex 不调用 Codex 专属工具；使用独立 Web URL，同步脚本与 Web 必须绑定同一目录。

团队授权不扩展到发布、外部消息或修改全局登录。UI 只查看、筛选和刷新，不派生、审批或修改原生任务。


## 强制 AC 与人工结果验收

正式登记、分派、恢复及交付前读取[每张卡的强制验收合同](../team-sync/references/acceptance.md)。父工单和每个执行均须非空具体 AC；先原子登记再派生。编码必须有实际通过的单元测试 AC，UE 必须有具体版本原型用户确认。Agent 逐项自主验证并提交本卡当前版本证据；只为确需人工核验的功能添加人工项，写清入口、操作步骤和预期结果；无需人工核验的卡不添加通用确认项。执行结束、Agent Review 和人工验收独立，不能代替彼此。
