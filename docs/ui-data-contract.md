# 只读 UI 展示数据合同

当前入口（2026-10-02）：用户提及 `@Agent Team` 在当前主会话启用原生团队技能；后续需求沿用，直到退出。只读 Kanban / Org Chart 按真实主会话及其全部已观察子 Agent 展示，Workspace 作为项目筛选上下文。插件 ID 为 `agent-team`；只读工具名保留兼容。入口已打包，宿主新会话的自动匹配仍须区分于代码检查通过。
日期：2026-10-02。状态：阶段二实施合同，已接入本次真实原生团队的启动/停止 Hook、父子关系与明确任务回报；接入范围为本机本流程。
规格入口：[阶段二规格](../.scratch/readonly-team-ui/spec.md)。领域术语沿用 [GLOSSARY](../GLOSSARY.md)。

## 数据职责

原生 Codex 承担派生、执行、协作、权限与 Skills。适配层仅采集可观察元数据、读取明确任务回报并形成展示快照。UI 查询快照，不控制 Codex。
生命周期来源与任务语义来源分开：真实 Agent 标识、父会话和生命周期来自原生事件；标题、目标、评审阶段与技能应用需要显式回报或读取证据。
官方 Hooks 的 SubagentStart/Stop 可提供 agent_id、agent_type、turn_id；其 session_id 是父会话标识，不能当作子 Agent 身份。
内嵌应用的宿主主题上下文并不代表拥有整个 Codex 项目与线程 API。对话工具可调用也不代表 iframe 可调用。
参考：[Hooks](https://learn.chatgpt.com/docs/hooks)、[插件参考](https://developers.openai.com/plugins/reference)、[原生接口审计](research/native-plugin-api-audit.md)。

## 字段与来源

下列名称是本项目展示合同，并非声称 Codex 原生提供同名接口。每条记录附 source、observedAt、coverage；缺失值用 null 与不可用原因，UI 显示未知。

| 对象 | 必要字段 | 来源与限制 |
| --- | --- | --- |
| Workspace | id、hostId、name、path、kind | 宿主可访问项目清单；id 按主机与原生项目身份区分，不以名称拼接匹配 |
| Workspace | connectionStatus、dataAvailability | 明确连接/采集证据；保存 SSH 项目不能推断在线 |
| Task | id、workspaceId、title、agentIds | 团队明确回报并关联原生标识；无可靠关联保持未关联 |
| Task | executionStatus、reviewPhase | 原生执行生命周期与团队评审回报分别存放 |
| Task | goal、acceptance、activitySummary、activityAt | 显式摘要及实际活动时间；缺失不补写 |
| AcceptanceItem | id、label、status、evidence、reportedBy | 独立条件；passed/failed 必须有依据和回报者，完成状态不自动勾选 |
| ReviewRecord | id、actorType、author、nativeAgentId、scope、decision、summary、evidence、reference、observedAt、source | Agent/人工、设计/交付分别保留；缺失时间标记未知；人工有效确认须有 user-confirmation 来源及明确回复依据 |
| AgentRun | nativeAgentId、parentSessionId、parentAgentId | 原生标识；父会话和父 Agent 不混用，未知父 Agent 不造边 |
| AgentRun | role、nativeRole、agentName、taskIds、lifecycle、activity | 职责 role 来自明确任务回报；nativeRole 来自原生 agent_type；agentName 来自协调者派生 task_name 明确回报。生命周期来自原生事件，分别保留来源 |
| Skill | name、usage、evidence | observed-read / reported-use / unknown；安装目录不证明当前使用 |
| Artifact | title、kind、reference、summary | 真实交付引用；可用性另行标记，不暴露无关日志 |
| Snapshot | workspaceId、revision、capturedAt、lastEventAt、coverage | capturedAt 是快照生成时间，不能替代实际活动时间 |

Profile 或模型仅在有来源时展示；缺失用未知，不按角色名猜测。只展示已接入采集范围，不宣称自动回填所有聊天。

## 验收、评审与导航

任务回报可包含 `acceptanceItems`，status 为 pending / passed / failed / unknown。通过或失败缺少 evidence 或 reportedBy 时降为未知。遗漏数组保留上次明确条件，显式数组整体替换，空数组明确清除；旧 acceptance 文本按分号/换行展示未逐项回报，不依据 completed 勾选。遗漏旧文字字段保留已有值，显式 null 清除；新文字替换旧条件时解除旧结构项，以实际回报为准。

`reviewRecords` 按同主会话和 Task 逐次保留，以记录 id 去重；scope 为 design / delivery / unspecified，actorType 为 agent / human，decision 为 passed / changes_requested / confirmed / comment。通过或确认须署名与依据；人工确认还须明确 user-confirmation 来源，否则仅作为反馈。人工退回与意见可使用 user-feedback 来源，不据此确认通过。UI 展示评审者、反馈、依据、时间、可用的评审执行会话，不把设计确认当交付验收。reviewPhase 是独立摘要，旧标签没有记录时显示“未接入评审记录”。

执行链接只使用本机已观察实例 UUID，通过宿主 App.openLink 和 codex://threads 深链导航；Org 展示 ID 不用于跳转。请求超时或拒绝有可见反馈；深链请求被接收与目标页完整加载分别核对。

文件链接通过 app-only 只读工具 `get_agent_team_artifact` 读取所选主会话已关联任务的 artifacts 或 reviewRecords.reference。仅本机工作区文件，校验词法及真实路径边界，禁止任意文件或符号链接越界；文本最多预览120KB，二进制说明不可文本预览。iframe 尚无原生文件编辑器直达协议，UI 提供实际文件预览与完整路径，不经 sendMessage 启动模型做导航。

## 状态投影

- 待开始：有明确 queued/计划任务回报。
- 进行中：有明确 running 状态。
- 待评审：有明确 awaiting_review 回报；不能仅由 Agent 停止推断。
- 执行完成：明确 completed 且没有待评审阶段；另展示评审结果，不等同验收或发布。
- 待修正：保留修正标记，有明确运行时放进行中，否则显示已知阶段或未知/异常区域。
- failed、interrupted、blocked：保留原始状态及原因，不归入成功。
- 无法可靠归列：独立未知/异常区域，不默认待开始，也不从看板计数中静默丢弃。

生命周期结束不等同 Task 成功；需要明确任务结果。评审通过仅由评审回报展示。
Org Chart 先核对真实 parentAgentId，再按父组织分支与明确职责递归汇总历史执行实例。展示节点使用独立 orgNodeId，不冒充真实 UUID；仅显示最近任务，详情保留全部实例、其他未完成任务和条件显示的历史任务。并行活动注明数量，最新实例切换不改变组织节点。原始 agents/tasks 不删改，真实边证据另行保留。未知职责、缺失父级或循环不擅自汇总；只有父 session_id 时须可靠映射，未知关系不补造。任务依赖不画成组织父子边。

Codex 子智能体列表按实际派生实例及宿主显示名称展示；看板按职责筛选，不能将角色筛选当作 Profile 清单。历史名称或执行配置未采集时保持未知，实例数量只代表已接入范围，不以宿主截图补造缺失记录。

## 刷新与可用性

页面可见每 10 秒读取当前范围，隐藏暂停、恢复即读。顶部刷新与减少动效按钮已移除，异常空态保留重试。单次请求超时建议 10 秒，失败后间隔退避至最多 60 秒。
同时最多一个请求，切换 Workspace 使用新的请求世代，旧响应不覆盖新项目。项目清单周期同步，可复用同一只读请求。
重复事件去重；事件顺序无法证实时保留来源与不确定性，不凭接收时间覆盖确定终态。
断线保留快照，并显示旧数据、最近成功同步时间及失败提示。空任务只有在该范围已接入且查询成功时成立。
一次成功查询只证明数据通道可读，不能证明每个 Agent 的状态最新；分别显示最近同步与最近活动。
SSH 清单可来自已有兼容适配，但内部状态文件不是稳定公开 API，读不到时显示清单不可用。远程实时数据在本阶段标记未接入。

## 只读与采集边界

页面与 MCP 查询工具没有任务控制参数，不调用 sendMessage 触发执行，不启动另一套模型会话。历史探针的 act/审批/启动工具不进入正式只读入口。
若使用官方 Hooks，仅采集允许字段，不输出阻断、重试、权限决定或上下文注入指令；采集超时/失败不得阻断原生任务。宿主信任配置是实施时的显式前提。
采集器只为本机展示输送元数据，不承担调度或常驻执行保障。快照可重建，历史缺失明确标注。
不全量解析不稳定 transcript 格式，不收集凭据、完整提示或无关工作区内容。证据引用权限与访问失败必须明确。


## 当前版本的人工评审要求

Task 增加 `reviewRequirements` 数组，单项字段：id、kind（spec/adr/ui/tickets/delivery）、title、reference、version、digest（64位 SHA256）、applicability（required/not_applicable）、reason、reportedBy、affectedTaskIds。当前版本、指纹或引用缺失为未知；不适用必须有原因与回报者。省略数组保留原要求，显式数组整体替换，空数组表示未回报要求，不能当作通过或豁免。

ReviewRecord 增加 targetId、targetVersion、targetDigest。必须与当前要求精确匹配、actorType=human、范围为 design（交付为 delivery），并满足既有署名/依据/来源检查，才投影已确认。按保留记录顺序取最近明确 confirmed/passed/changes_requested 决定；comment 不覆盖决定。旧版有效确认显示历史，新版待确认；Agent Review、旧无版本记录均不能满足当前条件。记录数组按原有 id 增量合并，协调者用新 id 保存每次决定，不用相同 id 改写历史。

Snapshot Task 的 humanReview 为派生展示：unreported / unknown / awaiting_confirmation / changes_requested / not_applicable / confirmed，items 分别展示部分确认与 stale_confirmation。依据来自协调者回报，不验证真实用户身份，不拦截原生执行。实际文件指纹由协调者核对，保存的被评审原文用于版本依据。affectedTaskIds 仅表达展示关联，不实施自动调度。

文件预览也允许所选任务 reviewRequirements.reference，仍遵守工作区、真实路径、关联范围和文本大小边界。A+B 顶部汇总当前主会话的待确认对象，详情首屏展示当前清单，历史折叠，交付验收单列；导航与查看操作保持只读。


## 选择器排序与未命名会话

主会话列表按整个已观察团队（含子 Agent）的最近事件时间 lastActivityAt 倒序，不用快照生成时间排序。Workspace 取已接入事件时间与宿主项目 updatedAt 的较新值，按时间倒序；宿主更新时间仅为兼容元数据，不代表远程实时执行在线。缺少时间置末，同时间保留输入顺序；切换SSH项目不丢失本地已知活动依据。

用户后续明确要求过滤未命名会话。缺少可读标题（空白、缺失或旧UUID标题）的会话不出现在选择菜单中；有标题会话保持时间倒序。过滤仅作用于展示选项，保留原始记录与内部关联。完整UUID保留在有标题选项的鼠标提示中；若当前绑定会话没有可读标题，工具行显示“选择主会话”，不另造名称或自动切换数据范围。


旧连接兼容：会话/Workspace未提供lastActivityAt字段时，UI通过既有只读范围查询取得各主会话snapshot.lastEventAt，补齐真实活动时间后排序；查询保留30秒缓存，当前快照已有时间直接采用。新后端显式提供时间（含null）时不追加查询。逐条查询失败仅该项保持未知，其余已知时间保留；选择范围不改变，菜单仍过滤无标题会话。
