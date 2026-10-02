# Agent Team 会话入口交付

日期：2026-10-02。用户授权：直接提及 `@Agent Team` 启用当前会话后续原生团队技能，并自动呈现会话 Kanban。

已实现并安装本地插件 0.3.0，显示名称 Agent Team，保留技术 ID `agent-team-probe@agent-team-local` 及只读工具名称。打包 `skills/agent-team/SKILL.md`，保留项目 native-agent-team 的原主动调用限制。入口描述支持直接提及、本会话后续沿用、仅查看、退出及新会话不继承。

两个只读工具接受 rootSessionId。看板按真实主会话及已观察全部后代隔离，支持根协调者回报孙 Agent 任务；未知或未绑定会话不降级展示全 Workspace。首次宿主工具输入与结果绑定会话，刷新和缓存以项目、会话共同隔离。移除全局入口要求，保留会话入口和 inline/fullscreen 显示能力。

真实团队：requirements 子 Agent 调研公开插件格式与安装；architect 子 Agent 分析会话边界并独立审查；主 Agent 为唯一写入者。实际新 Hook 身份为 requirements `01a0fab9-5500-7f31-a694-ea5999bbd0ad`、architect `01a0fab9-2a5a-7bc3-b7f6-0da35fd9b6d0`，来源为当前主会话实际 SubagentStart/Stop，结合角色与本轮分派时间对应，不声称派生工具直接返回 UUID。

验证：22 项身份投影、只读 MCP、会话切换缓存、Org、筛选及 Workspace 解析检查通过；UI build 通过；design lint 无错误或警告。独立审查发现会话按钮刷新丢焦点、根协调者孙任务被丢弃两项 P2，已修正并复查通过。浏览器预览实测未绑定提示、真实会话 Kanban 与 Org Chart。正式安装缓存包含新名称、入口技能，源与安装 board.mjs SHA256 相同。

限制：当前运行会话仍提供旧版插件工具 schema。未把安装成功或预览结果当作“新会话提及即自动匹配 Skill”的端到端证明。重新加载宿主后可在新会话输入 `@Agent Team + 具体任务`。插件技能要求协调者调用只读 opener 自动产生会话卡片；宿主展开方式由 Codex 决定，无强制弹窗或内置摘要插槽承诺。

没有新增执行器、调度器或全局任务数据库；SSH 实时活动范围保持未接入。仅已接入生命周期和明确回报可展示，未知任务不补造。

依据：[插件 Skills](https://developers.openai.com/plugins/concepts/skills)、[插件打包](https://developers.openai.com/plugins/build/plugins)。
