# Codex 原生设计核对与验收纠正

日期：2026-10-02。此文是当前设计纠正，不是新增独立执行器 POC。

## 来源与证据层次

核对 [Build skills](https://learn.chatgpt.com/docs/build-skills)、[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、[Customization](https://learn.chatgpt.com/docs/customization/overview)。
本机 codex-cli 0.159.2 的 debug prompt-input 只读渲染显示 domain-modeling、codebase-design、writing-for-agents、native-agent-team 的名称、描述及 r6/.../SKILL.md 路径。
这些别名由原生提示提供；精确匹配绝对目录字符串会漏检，不能据此判断技能不可用。检查未发起模型任务，也未输出完整提示。
以上确认官方设计和当前本机可见行为；没有获得桌面 App 内部实现源码，不能称为闭源代码审计。

## 核对结论

- Skills 先以名称、描述、路径等元数据供发现，Agent 选用后再读取正文及必要引用；内置/系统、用户、项目与插件技能按宿主有效配置使用。
- 子 Agent 未覆盖时继承父会话 Skills 配置；上下文、工作目录、工具可用性与用户调用限制仍影响实际使用。
- 原生委派通过任务指令表达职责并收集结果。自定义角色 TOML 是另一套可选配置层，不能把它与 Skill 按需使用混为一谈。
- 自动发现及选择不等于全部正文自动预加载，也不保证每个任务都正确触发；用户专属技能继续保留调用边界。
- 插件负责只读显示，执行、协作与技能使用继续属于 Codex。

## 验收纠正

撤销此前误加的自动角色装载门槛，正式工单按真实派生、职责、技能应用、任务产物、并行、审查和汇总重新核对。
已有本机小型配置任务证据满足五项工单，无需重跑角色或独立执行器 POC。可选配置覆盖未实测不报告为通过。
旧执行/审查报告保留当时观察；其“因此阻塞工单”的推论已被本次用户澄清取代。旧文件指纹仅绑定旧审查版本。

## 后续

本机原生配置与协作交付已验收；完整原生数据接入只读 Kanban/Org Chart 尚未实现，继续按原生可访问数据范围做展示设计。
