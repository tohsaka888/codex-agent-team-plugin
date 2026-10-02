# Codex 内嵌 Agent Team 可行性调研

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

日期：2026-10-01。目标宿主为用户当前 Windows ChatGPT 桌面 App 的 Codex 界面，截图圈选的是左侧全局导航栏。

## 结论

有官方插件扩展路径，值得推进最小安装验证。推荐候选架构：Plugin + MCP Apps UI + OpenAI MCP Extensions + 本地编排服务 + Codex App Server。
不能把协议支持当成当前客户端端到端通过。左侧入口实际展示、Workspace 上下文和实时执行接入是进入完整开发前的验收门槛。
上一版独立看板的视觉方向已被用户否决，不能再作为实现基线；本轮不生成新效果图或启动完整开发。

## 用户需求基线

- UI 内嵌宿主，与当前 ChatGPT / Codex 的字体、背景、边框、交互和主题保持一致。
- Workspace 维度的 Agent Kanban：任务拆解后并行执行，追踪进度，明确人工评审阶段。
- 方案定稿和版本验收均需人工评审确认，不能以 agent 自审替代。
- 参考 Jira 的卡片交互：点击卡片打开右侧详情，保留看板位置、选中态和筛选上下文。
- Agent Org Chart 展示实际执行关系和每个 agent 正在处理的 task，不只是静态角色层级。
- 从宿主左侧图标进入，默认查看相关 Workspace 的 Kanban，在插件内可切换 Workspace。
- 目标是增强原生工程协作体验，独立外部网站不视为该要求的等价交付。

## 能力矩阵

| 能力 | 官方资料 / 本机证据 | 判定与边界 |
| --- | --- | --- |
| 自定义插件打包安装 | 官方支持 manifest、项目或个人 marketplace；本机有 plugin 命令 | 支持。具体 UI 插件尚未安装验证 |
| 宿主内 Kanban | 官方 MCP Apps 为 iframe UI，支持结构化交互 | 组件层可实现；当前 Windows 客户端渲染待验证 |
| 全局侧栏入口 | Plugin Extensions 的 global entrypoint | 官方支持；图标能否固定在截图指定位置、是否出现在更多菜单由宿主决定，未实测 |
| 会话侧面板入口 | thread entrypoint | 官方支持；可辅助聊天上下文，但不能假定可替换原生聊天组件 |
| 卡片右侧详情 | 插件组件内实现抽屉 / 分栏 | 可自行实现；不依赖注册新的宿主原生详情面板 |
| 人工方案评审 / 版本验收 | 插件工具 + 自己的状态机和存储 | 可自行实现；不是工具执行权限审批，也不是自动审查 |
| 实际 agent 流程图 | 本机协议包含 parentThreadId、collabAgentToolCall、subAgentActivity 等 | 有数据基础；实时订阅、重连及覆盖范围待验证 |
| 多任务并行 | App Server thread / turn 接口与原生 subagents | 可实现候选；本轮未启动模型执行，实际并发和隔离未测 |
| Workspace 列表 | 本机 project/list 和 thread/list 成功；协议含 projectId / cwd | 列表读取可行；当前 UI 的选中项目能否自动传给插件未确认 |
| 原生聊天全面接管 | 未找到公开插件 API 允许任意改写宿主组件和导航 | 不作为可承诺能力；采用官方新增入口和会话面板 |

官方资料：[Plugin Extensions](https://developers.openai.com/plugins/build/extensions)、[插件打包](https://developers.openai.com/plugins/build/plugins)、[MCP UI](https://developers.openai.com/plugins/build/chatgpt-ui)、[App Server](https://learn.chatgpt.com/docs/app-server)。

## 插件形态与安装路径

官方扩展可声明全局入口和会话入口。全局入口打开宿主内的应用内容区域，适合 Workspace 看板；会话入口适合随聊天查看关联任务。入口的呈现和排序由宿主控制。[扩展文档](https://developers.openai.com/plugins/build/extensions)

入口元数据候选如下，需结合正式 SDK 在验证原型中注册，不能只写进插件 manifest 就宣称出现侧栏图标：

```ts
const metadata = {
  ui: { resourceUri: "ui://agent-team/board" },
  "openai/ui": {
    entrypoints: [{ type: "global" }, { type: "thread" }],
  },
};
```

项目内 marketplace 可使用 `.agents/plugins/marketplace.json` 指向 `plugins/<name>`。官方同时提供可移植根 manifest 和 `.codex-plugin/plugin.json` 兼容布局；下一步必须验证本机实际加载，不混写两种格式。App 内 UI 接入涉及已注册 MCP server 映射，单独安装 `.agents/skills` 不是完整插件安装。[打包与本地安装](https://developers.openai.com/plugins/build/plugins)

带 UI 的 MCP 接入优先核实开发者模式及账号策略。官方测试路径包括 HTTPS 和 Secure MCP Tunnel；本地 stdio 工具可用不代表全局 UI 注册自动成立。开发验证与公开插件提交是不同流程，本轮不部署公开端点。[连接与测试](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## 与宿主一致的 UI

组件通过宿主桥接能力适配主题和环境；官方推荐 Apps SDK UI，并要求结构性文字、字体和颜色遵循宿主系统。下一版不再保留第二套项目导航、独立仪表盘标题和自定蓝色品牌外壳。[UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)、[桥接参考](https://developers.openai.com/plugins/reference)

内容区拟仅包含 Workspace 选择器、Kanban / Org Chart 切换、任务筛选和必要操作。卡片详情在插件内部右侧展开；窄会话面板改为任务摘要及单任务详情。
准确的颜色和间距在取得宿主运行时主题并完成内嵌验证后再确定。截图是视觉参考，不是插件能力证据。

## Kanban 与人工评审语义

建议以“待开始 → 进行中 → 待评审 → 已完成”为默认列，阻塞 / 失败作为明确可筛选状态。技术评审与人工评审分别记录，不把两者揉成一个自动完成步骤。

- 方案定稿：reviewStage=design，人工批准方案版本后才能启动依赖该方案的实现。
- 版本验收：reviewStage=release，测试和技术审查通过后汇总交付证据，人工确认后才能标记版本验收通过。
- 普通执行任务不必全部人工审批；只有对应门槛的任务 / 决策卡进入人工评审，避免制造审批负担。
- 评审记录包含评审对象、版本、基线或交付提交、结论、评审人、时间和退回理由。方案或交付版本变化使旧批准失效。
- 新增明确的 `awaiting_human_review` 状态，与 `awaiting_review`（技术审查）和执行权限审批区分。

右侧详情包含目标、验收条件、依赖、当前执行 agent、run / thread 引用、活动记录、代码与测试证据以及评审操作。
任何 UI 状态转换都由服务校验依赖与审批；拖动卡片不能绕过评审门槛。

## Org Chart 与实际执行

图中节点对应真实 agent run；角色只是节点属性。需要同时区分派生关系、任务依赖、消息 / 移交关系，不能把不同关系都画成组织汇报线。
节点显示正在执行的 task、状态、最近事件和来源。完成或历史 run 不能伪装成仍在线的 agent；事件缺失显示未知或待同步。

App Server 提供 thread / turn / item 事件以及子 agent 的来源过滤，部分关联字段需要实验 API。独立启动的服务实例能读取共享历史，并不自动拥有桌面 App 当前执行的实时事件；必须验证同一运行实例的连接和订阅。不能只用文件轮询声称实时观察所有原生聊天。[App Server](https://learn.chatgpt.com/docs/app-server)

候选方案优先追踪编排服务拥有的执行会话；如果用户需要接管当前桌面原生会话，则同实例接入与状态一致性是额外门槛，验证失败时明确说明范围，不能悄悄换成另一套聊天。

## Workspace 范围

此处 Workspace 指工程项目及其代码工作区，不是 ChatGPT 组织账号 workspace。建议建立宿主 projectId、hostId、仓库根目录和工作区路径的显式映射；远程主机、Git worktree 与同仓库多个 checkout 不能仅凭显示名称合并。

本机 project/list 已能返回项目 roots，thread/list 支持 cwd / projectId 过滤。插件能读取哪些项目须由接入服务和访问范围决定；浏览器 iframe 不能自行读取本机文件或 CLI。
若全局入口不传当前项目，上次选择或显式 Workspace 选择器可以作为候选交互，但不视为已经实现“自动进入当前 Workspace”。是否接受该差异留到实测后决定。

## 本机只读验证

- Windows App 包：`OpenAI.Codex`，版本 `26.928.3736.0`。
- 所用本机 CLI：`codex-cli 0.159.2`。
- `codex plugin --help`、`codex plugin marketplace add --help`：存在本地 / Git marketplace 管理入口。
- `codex app-server generate-ts --experimental`：成功生成本机协议类型，缓存于忽略的 `.runtime/research/`。
- stdio App Server：initialize、project/list、当前仓库 cwd 下的 thread/list 均成功。
- 探针未执行 thread/start、thread/resume 或 turn/start；未启动 agent、改变现有会话或消耗模型推理额度。
- 探针没有连接当前桌面 App 已运行实例，因此不证明实时观察其活动。

可复现脚本：`scripts/research/probe_codex.py`；脱敏结果：`docs/research/local-probe.json`。结果仅保存返回字段和数量，不保存项目名称、聊天内容或凭据。

## 下一步候选执行方案与验收门槛

1. 最小插件：一个 MCP UI 资源、global / thread 入口和简单宿主风格内容。验证项目 marketplace 安装及入口出现，记录截图与调用日志。
2. 上下文验证：从左侧和会话分别打开，记录 host 提供的能力与项目上下文字段；验证 Workspace 列表、切换及刷新保持。
3. 执行验证：两条隔离任务并行运行，采集真实 start / item / completed 事件，Org Chart 能关联 agent 与 task；验证断线后的未知态与恢复。
4. 人工门槛验证：方案批准前实现不启动，交付未确认不能验收完成；退回、版本变化和重复提交有确定行为。
5. 上述门槛通过后再决定应用技术栈和完整实现，重写 UI token，并制作宿主内的 Kanban / 右侧详情 / Org Chart 三个预览。

如果当前账号或 Windows 版本不开放 global 入口，明确提交差异及替代入口；不会把独立网页自动当成原需求通过。
更新：已安装自制本地插件，用户截图确认左侧入口能打开内嵌页面；尚未确认页面数据链路和执行闭环。最新实测及未完成门槛以 `verification-results.md` 为准，后续架构方案仍为提案，未改变账号开发者设置。
