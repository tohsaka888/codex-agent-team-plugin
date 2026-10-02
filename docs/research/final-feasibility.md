# 可行性收口与执行职责修正

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

最新原生路线实测与最终判定以 [原生 Codex 团队插件可行性结果](native-feasibility-result.md) 为准：完整原生端到端验收未通过，不能把本文历史独立执行器通过项用于宣称用户需求全通过。

## 最新修正：Codex 原生执行，插件展示与映射

用户明确要求执行、agent team / subagents 和 SSH 工作区任务均使用 Codex 原生能力。插件提供内嵌 UI、团队工作项与原生任务的映射、自动刷新和人工评审记录；轻量数据桥接不等于独立执行服务。

此前 POC 通过另起 App Server 并经 SSH 启动远程 Codex 验证独立执行器，偏离了这个职责边界。其 `401 unauthorized` 仅证明该探针路径失败，不能据此判断宿主已有远程任务不可用，也不要求用户先修复该路径才能开发插件。下文表格保留为历史实测证据，不再用于宣称用户要求的原生集成已完成。

收口结论：插件安装、侧栏入口与宿主 UI 已有实测证据；Codex 原生 subagent 能力有官方说明。但第三方插件自动读取宿主全部原生任务、实时父子关系与跨 SSH 状态尚无完整端到端证据，因此撤回此前对该完整需求已验证可行的过度结论。当前应按原生优先方向规划状态桥接及可见性边界，不再扩展独立执行器 POC。

参考：[原生 Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[插件扩展入口](https://developers.openai.com/plugins/build/extensions)。MCP Apps SDK 的通用宿主上下文提供样式、工具信息和显示模式等；这些字段不能当成全局原生任务事件订阅的证明。

## 以下为独立执行器路线的历史报告

日期：2026-10-01。本轮是收口验证，不再建议开启新的 POC 轮次。探针 0.1.7 已安装。

## 对用户需求的回答

**可以开发 Codex 宿主内的 Workspace 团队看板，提供并行任务、人工评审、右侧详情、Agent 执行关系与任务追踪。**

成立的架构是：Codex 插件提供 MCP/UI 入口；独立执行服务保存任务、批准和事件，并管理自己创建的执行会话；UI 读取并展示这些实际记录。左侧入口和宿主握手已有用户截图证据。本轮补齐普通浏览器通过真实 MCP 的评审、执行、追踪和验收链路。

不能承诺的行为：随意修改宿主导航位置、自动接管所有既有原生聊天及其内部 subagents、凭清单发现就获得 SSH 执行权限。宿主 UI 元数据和实际访问范围决定入口与可见性。

## 最终端到端结果

| 验收路径 | 实测结果 |
| --- | --- |
| UI 未批准 → MCP start | 服务拒绝，页面显示“请先评审并批准 POC 方案” |
| UI 批准 → MCP start → 实际 App Server | 真实启动两个隔离任务，报告 jobId 等于页面启动请求 ID；本机执行 8 项检查全部通过 |
| 实际事件 → Kanban / Org Chart / 详情 | 真实记录、独立会话 ID 和中断/恢复事件已展示，未伪造原生父子关系 |
| 执行证据通过 → UI 验收 → 持久记录 | 页面 accepted、方案批准和版本验收为是；新的 MCP 服务读取仍然 accepted |
| 重复启动 | 新 MCP 调用被拒绝，未重复执行 |
| 主动中断与重启 | interrupted 后 thread/resume 恢复相同会话、历史原文保留，恢复检查不重跑命令 |
| 执行期间强杀 | taskkill 仅作用于验证创建的 App Server 进程树；重启恢复相同 thread，记忆恢复，无命令重放；4 项检查通过 |
| SSH 远程 | SSH、登录 shell、远程 codex 0.156.1 和 App Server 初始化/会话启动成功；模型 turn 失败，错误为 `workspace routing discovery unauthorized (401)`；未取得远程命令成功或恢复的证据 |

最终机器结果 `final-e2e-probe.json`：**localE2ePassed=true，allEnvironmentsPassed=false**。这是实际结果，不将部分失败改成全部通过。

## 必须保留的边界

1. 评审按钮的链路已真实接到 MCP 与持久服务，但测试点击由代理执行；POC_BROWSER_ACTION 明确标记为 POC 操作，不是宿主真人身份认证。写工具元数据 visibility=app，使模型默认不使用审批入口；它不是生产级授权系统。正式实现要把真人确认绑定到身份、具体方案/交付版本和可信 UI 通道。
2. 本次页面交互在普通浏览器进行，使用服务器的 HTTP 桥接实际调用 MCP，并未伪造接口返回。Codex 内嵌与握手由此前截图独立证明；当前没有已打开 MCP App 的可自动化页面接口。本次没有重新验收新按钮在宿主中的点击，不将其描述为全部宿主端到端通过。
3. 已读取 Computer Use 技能的 guidance 约束：`Do not automate the ChatGPT desktop app UI or Codex CLI or Codex extensions within Windows apps.` 因而不通过原生 UI 自动化绕过访问限制。技能路径：`C:/Users/15613/.codex/plugins/cache/openai-bundled/computer-use/26.928.31416/skills/computer-use/SKILL.md`，约束来源为该技能引用的 `../../docs/guidance.md`。
4. SSH 阻碍是当前远程模型授权/路由错误。没有拷贝本机 auth 到服务器、换账号或修改登录配置。SSH 上运行成功不能由本机成功推导；修复远程环境授权是实施前提，不是产品架构不可行的证据。
5. 崩溃恢复验证证明历史可恢复、不会由该测试自动重放命令，不证明任意外部写操作 exactly-once，也不代表被杀死的命令可以从中间续跑。正式实现要使用 unknown 状态、恢复检查点及副作用确认。
6. 远程项目发现仍读取宿主内部持久化格式，正式实现需隔离为兼容适配器并保留降级提示；不把它当稳定公开 API。

## 交付与决策

结论固定为 **“核心需求能做；本机 POC 闭环通过；SSH 当前环境失败；宿主新审批按钮及真人身份不声称已全部验收”**。不再反复要求用户配合开启 POC。

后续进入详细规划和产品实施：按本结论约束安排正式批准通道、后台生命周期、SSH 授权与可靠恢复。当前探针不是完整产品，SQLite/框架/角色池等选型仍未定稿。

## 证据

- `final-e2e-probe.json`：跨 MCP 重启、重复启动保护、UI job 与真实执行绑定及本机/远程最终状态。
- `runtime-probe.json`：本轮由页面启动的真实模型执行及事件。
- `crash-probe.json`：执行期间强杀与恢复。
- `remote-runtime-probe.json`：SSH 模型执行的真实 401 失败。
- `review-gate-probe.json`：退回、版本更新、幂等和过期批准的规则测试。
- `e2e-accepted-v017.png`：真实 MCP 链路的页面验收结果，普通浏览器模式。

复现检查：`node plugins/agent-team-probe/verify-e2e.mjs`（不再次启动模型）；真实运行仅由页面的一次性“启动端到端测试”操作触发，重复启动拒绝。执行测试产物在 `.runtime/probe/`，远程仅在 `/tmp/codex-agent-team-poc-PROBE_*` 创建本轮隔离 fixture；未清理未知资源、提交或推送。
