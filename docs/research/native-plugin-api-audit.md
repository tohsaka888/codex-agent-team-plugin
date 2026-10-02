# 原生 Codex 与第三方插件接口审计

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

核查日期：2026-10-01。范围：官方资料和本项目已安装 SDK 类型；没有启动新的执行器、SSH 执行会话或原生聊天。本报告是接口审计，不把文档支持当成本机端到端通过。

## 结论

原生 Codex 执行、插件展示的职责划分成立。官方有原生生命周期 hooks、MCP 工具回调和 UI 向当前对话发送消息的接口，允许构建轻量事件桥接。**纯 MCP Apps UI 安装后即读取全部宿主原生任务、全部 SSH 工作区实时状态，并任意继续指定原生聊天，未获得公开接口或完整实测支持。**这不等于证明宿主内部不存在相关能力。

## 能力与证据

| 能力 | 审计结果 | 依据与边界 |
| --- | --- | --- |
| 左侧入口、全屏应用、聊天侧面板 | 官方支持 | `global` / `thread` entrypoint；支持图标。[官方扩展文档](https://developers.openai.com/plugins/build/extensions) |
| 原生并行 subagents | Codex 原生支持 | 应用展示 subagent 聊天，Codex 收集结果。插件无需另建模型执行器。[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) |
| 原生生命周期写入插件 | 官方支持的桥接路径 | `SubagentStart` / `SubagentStop` 提供父级 `session_id` 和子 `agent_id`；工具 hooks 提供实际调用信息。已连接 MCP 可接受 `mcp_tool` hook 回调。[Hooks](https://learn.chatgpt.com/docs/hooks) |
| UI 确认传入原生对话 | 官方有消息接口 | `ui/message` / SDK `sendMessage`；兼容层也有 `sendFollowUpMessage`。但消息目标是当前应用所关联聊天，不是任意选中的任务。[UI reference](https://developers.openai.com/plugins/reference)、[官方扩展协议](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) |
| UI 自动列举全部原生聊天、项目、远程 hosts | 当前公开 UI 协议未见此契约 | 基础 hostContext 与扩展协议提供主题、工具调用、应用上下文等；不是全部聊天数据库或执行流。需另有被验证的数据桥接。[官方扩展协议](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) |
| 读取原生历史及 subagent 父子关系 | App Server 协议支持 | `thread/read/list`、父子过滤、运行状态及通知；部分接口 experimental。能力归属所连接服务实例，不能自动推广为插件连接宿主实例。[App Server](https://learn.chatgpt.com/docs/app-server) |
| 连接既有 App Server | 协议有控制 socket 路径 | 文档含 `unix://` 默认控制 socket；不能笼统断言必须另起进程。本机 Windows 宿主是否暴露可用端点、远程是否可达，须以实际证据判断。[App Server](https://learn.chatgpt.com/docs/app-server) |
| MCP Events 获得宿主事件 | 方向不符 | 文档描述 ChatGPT 订阅插件服务发出的更新；不能作为插件订阅 Codex 内部全部事件的证明。[MCP Events](https://developers.openai.com/plugins/build/mcp-events) |

## 桥接路径的实际限制

Hooks 可打包进插件，但非受管 hooks 必须经过信任审查；安装本身不能证明 hooks 已启用。MCP hook 使用既有连接，不主动连接服务；启动时服务未就绪可能漏报，`SessionEnd` 不支持 MCP hook。Transcript 格式不是稳定接口。插件需显示缺失、断线和最近同步时间，不能伪装为完整审计。[Hooks](https://learn.chatgpt.com/docs/hooks)

Org Chart 应由真实父子事件构建；任务名称、方案版本和人工验收是团队业务字段，不能仅凭线程执行完成推导。历史线程及未启用桥接的工作区不能保证自动回填。SSH 环境的事件回调与汇总连接尚需当前宿主验证；本地成功不能覆盖远程。

全局应用入口在桌面创建自己的聊天布局，`ui/message` 面向该聊天。若在全局看板点击另一个工作区的卡片，不能仅发送“继续”就宣称已恢复该卡片对应的原生任务。应验证目标线程关联、版本审批记录及原生执行消费该记录的链路。[官方扩展协议](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)

## 本地 SDK 对照

检查 `plugins/agent-team-probe/node_modules/@modelcontextprotocol/ext-apps/dist/src/spec.types.d.ts` 的 `McpUiHostContext`：已定义字段包括工具信息、主题、样式、显示模式、区域、设备等，没有必需的 `threadId`、`projectId`、`hostId` 或原生任务清单。索引签名允许将来扩展，因此这只是当前类型契约的边界，不是不存在其他接口的证明。

检查同 SDK 的 `app.d.ts`：`sendMessage` 返回可被宿主拒绝的结果，`updateModelContext` 提供后续轮次上下文，`callServerTool` 调用 MCP 工具。当前聊天模型可用的 `mcp__codex_app__list_projects`、`read_thread` 等宿主工具，不能据此认定第三方服务或 iframe 能直接反向调用这些工具；必须明确桥接主体和权限。

## 验收口径

可以采用“原生 Codex + hooks / 模型 MCP 回报 + 状态存储 + MCP Apps UI”。上述为有官方依据的实施路径，仍需实际事件验证；无需重跑独立执行器。若要求无配置、无桥接地全量实时覆盖所有历史聊天和 SSH 工作区，目前证据不足，不应承诺。

以前独立 App Server 的本机并行与 SSH 401，只说明那个探针实例的行为，均不能作为当前宿主原生链路成功或失败的证据。
