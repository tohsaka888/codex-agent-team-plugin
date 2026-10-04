---
name: team-ue
description: Agent Team 的 App 或网页 UI 设计任务：收集已有图，缺图时生成 UIUX 供用户评审，确认后归档并生成 design.md，作为开发基线。
---

# UE 设计基线

适用于已启用团队的 UI 新设计或实质视觉修改。读取 [设计工作流](references/workflow.md) 和团队提供的 team-sync 指引；沿用当前宿主原生 Agent 派生与可用生图工具。

已有匹配范围的已确认图可以复用。没有图时核验实际 imagegen 能力，生成可查看候选让用户评审；能力缺失时如实说明，不以文字描述冒充 UI 图。用户明确确认具体图后才归档和生成 design.md。

工单通过通用同步关联图、UX说明、具体确认版本和指纹。部分确认只适用于对应页面/状态。开发读取同一确认图、ux.md 和 design.md；审查保存实际实现截图，不覆盖确认基线。UE 的运行状态、Agent Review 和用户视觉确认分别同步。
