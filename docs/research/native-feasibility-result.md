# 原生 Codex 团队插件可行性结果

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

范围变更说明：用户随后明确缩减为仅查看的 Kanban / Org Chart，暂时去掉持久任务数据库、严格审批门槛和关闭 App 后继续运行要求。本文保留为旧控制型范围的验证报告；其中指定线程继续执行等失败项已不属于当前验收要求。当前只读路线有原生 hooks / MCP 的官方实现依据，UI 已实测；本机 / SSH 原生事件进入看板仍未实测通过。最新架构见 `../architecture.md` 开头。

日期：2026-10-01。目标：Codex 原生执行，插件提供 Workspace Kanban、人工评审、右侧详情、真实 Agent Org Chart、左侧入口与 SSH Workspace 切换。此报告优先于此前独立执行器报告。

## 决策结论

**当前纯 UI 插件直接接通全部原生本机 / SSH 任务的方案不通过实施准入。**主要障碍是插件获取宿主执行数据和定位目标聊天的接口边界，不是 Codex 不会执行，也不是此前远程独立执行器的 401。

**“Codex 原生执行 + 插件 UI + 轻量事件桥接”有官方接口依据，但本机原生 hooks → 看板 → 人工确认 → 指定原生任务继续，以及 SSH 的同等闭环没有实测通过。**不能把它写成完整端到端 POC 已完成或全功能保证可做。UI 和已保存 Workspace 管理可以保留；完整团队控制暂不作可交付承诺。

本轮检查已形成收口结果，失败项与证据缺口列在下表；没有启动独立执行器来替代失败项，没有修改账号、远程登录或启动新的 SSH 模型任务，也不建议再重复此前 POC。

## 验收矩阵

| 原始需求 / 验证项 | 判定 | 实际证据及限制 |
| --- | --- | --- |
| 插件安装、左侧团队图标、内嵌页面 | 通过 | 既有用户截图；本轮 `open_agent_team_probe` 打开真实 MCP Apps 页面，DOM 状态为“已完成 MCP Apps 宿主握手”。不是普通浏览器模拟宿主。 |
| 本机及 SSH Workspace 清单 | 清单通过，实时连接状态不通过 | 宿主 `list_projects` 返回 2 个本机、3 个 SSH 项目；插件下拉也显示这些项目。插件远程清单依赖内部持久格式，其 connectionStatus=unknown，不能据此宣称远程在线。 |
| SSH Workspace 切换与自动刷新 | 页面链路通过 | 在真实内嵌页面选择 Lyria；定时同步时间继续变化，选择保留。数据仅为项目和既有探针快照；不是远程原生任务实时订阅。 |
| UI 直接读取宿主项目 / 聊天 | 当前调用路径失败 | iframe 实际调用 `mcp__codex_app__list_projects`，返回 `MCP error -32602: Tool ... not found`。SDK `callServerTool` 面向所属 MCP server；对聊天 Agent 开放的宿主工具没有由此自动开放给插件。只证明这个调用路径失败，不证明所有可能接口不存在。 |
| 插件后端连接现有原生服务 | 默认控制 socket 路径失败 | `codex app-server proxy` 初始化前退出，默认 `app-server-control.sock` 路径不存在，错误码 10050。没有调用 daemon start，没有另起 App Server 掩盖失败；不能泛化为所有 Windows 或所有配置都不支持。 |
| 原生 SSH 聊天历史读取 | 宿主工具通过，插件直接读取未通过 | 用宿主 `read_thread` 读取既有“分析 LiteLLM session 调用频率”，返回 completed turn 及实际 fileChange 等条目。说明宿主可访问远程历史；不证明插件 iframe 可访问，也不证明当前新远程任务成功。报告只保存标识、状态和条目类型，不复制完整聊天。 |
| 原生 subagent 并行与真实关系 | 原生能力成立，插件追踪未通过 | 本轮使用 research 技能要求的原生子 agent 完成接口审计；官方支持父 session_id 与子 agent_id 的生命周期 hooks。没有采到当前宿主的实际 hook 事件并接入看板，旧独立会话卡片不是原生 Org Chart 验收证据。 |
| 每个 agent 当前具体任务及实时执行步骤 | 未通过 | 官方工具 hooks 有实际工具调用信息；工作项标题、角色与 thread 的映射仍需轻量存储 / MCP 回报。当前无覆盖原生本机和 SSH 的实时事件链路，不用旧探针数据顶替。 |
| 待评审状态、侧边详情、版本审批规则 | 展示和规则通过，原生执行消费审批未通过 | 既有页面可展示卡片 / 详情；本轮 4 项测试通过，覆盖过期批准、退回、恢复及多主机清单隔离。这些测试不证明原生 Codex 已在方案或交付版本上受该评审门槛控制。 |
| UI 将确认回传 Codex | 当前对话送达通过，指定任务闭环未通过 | 点击 `App.sendMessage` 测试按钮后宿主返回 `{}`；报告回合结束后，当前对话实际收到含 `NATIVE_UI_BRIDGE_20261001` 的 `untrusted_input`，来源为 `mcp_app`。补齐了 UI → 当前 Codex 对话的送达证据；应用消息不当作用户批准。此接口未证明能路由到任意卡片所指向的 SSH 聊天，也未证明原生任务消费版本审批并继续执行。 |
| 全部原生聊天、既有 subagents 与远程事件自动同步 | 未通过 | 当前 UI / MCP 协议审计未获得全局订阅契约；默认控制端点不可用；未配置并实测原生 hooks。不能声称完整需求全通过。 |

## 官方可用路线与边界

原生任务执行、派生 subagent、协作和远程执行继续由 Codex 承担。插件可以通过 hooks 向已连接 MCP 回报实际生命周期与工具事件，并持久保存任务映射和版本评审；这是一条有依据的轻量桥接路线，不需要第二套模型执行或 SSH 登录系统。[Hooks](https://learn.chatgpt.com/docs/hooks)、[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

Hooks 需要启用和信任，MCP hooks 使用已连接服务，启动时可能漏报；远程执行环境是否加载同一插件及回调如何汇总必须有实际证据。官方说明不是本机闭环的替代证据。当前插件没有打包 hooks，本轮也没有静默修改全局 / 远程 hooks 或绕过信任流程。[Hooks](https://learn.chatgpt.com/docs/hooks)

侧栏与聊天入口有官方扩展契约。UI 的 `ui/message` / `sendMessage` 提供向应用关联聊天发送消息的路径，但不是任意 thread 的直接执行控制接口。全局看板中的“继续”不能仅发送文本而不确认目标线程。[插件扩展](https://developers.openai.com/plugins/build/extensions)、[UI 接口](https://developers.openai.com/plugins/build/chatgpt-ui)

App Server 提供原生线程、父子关系和事件接口，控制 socket 允许连接既有实例；本机该默认路径实测失败。本报告不通过修改宿主启动参数、拦截私有 IPC、读取凭据或启动替代服务来宣称已接通。[App Server](https://learn.chatgpt.com/docs/app-server)

## 对“能不能做”的最终回答

- 能做并已实测：内嵌团队 UI、侧栏入口、已保存本机 / SSH Workspace 选择、页面刷新。
- 有官方实现路线但未获完整实测支持：通过原生 hooks / MCP 回报构建团队工作流的 Kanban 与 Org Chart，再经关联聊天处理人工确认。
- 当前不能承诺：安装一个纯 UI 插件就自动获得全部原生任务与 SSH subagent 实时状态，以及在全局看板任意控制目标原生任务。

**因此完整需求本轮端到端验收不通过；结论不是“所有 POC 都成功”。**若进入实施，必须明确采用轻量桥接和受管团队工作流，并解决目标线程关联与远程事件汇总；这属于有明确边界的实施方案，不能悄悄替换成独立执行服务。当前没有用户批准这一具体方案，也没有正式产品实现。

## 证据与复现

- [机器结果](native-host-evidence.json)：宿主本机 / 远程清单、远程原生历史、iframe 调用失败及消息确认范围。
- [原生控制连接结果](native-control-probe.json)：现有控制 socket 的实际失败。
- [官方接口审计](native-plugin-api-audit.md)：正向接口及可见性边界。
- [宿主页面截图](native-host-ui.jpg)：真实内嵌握手和直接宿主工具调用失败。
- `python scripts/research/native-control-probe.py`：只尝试连接现有服务，绝不启动 daemon / 模型 / 新会话。
- 在 `plugins/agent-team-probe` 执行 `node build.mjs`：构建成功并通过脚本语法检查；`node --test workspace-registry.test.mjs review-gate.test.mjs`：4 项通过。它们不是原生执行闭环测试。

通过 MCP Apps 的浏览器接口完成实际页面操作，没有自动化原生 Codex 桌面窗口。测试消息不代表用户批准工程方案或版本。未提交、推送、清理用户资源或更改远程环境。
