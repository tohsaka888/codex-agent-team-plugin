---
name: native-agent-team
description: 在原生 Codex 对话中按角色和 Skills 组织本机工程团队，完成分派、协作、审查及汇总。
disable-model-invocation: true
---

# 本机原生 Agent Team

这是项目原生工作流辅助，插件仍只展示 UI。用户调用或明确授权团队协作时执行。

正式工作前读取 [环境预检](../../../plugins/agent-team/skills/agent-team/references/preflight.md)，按实际主机和工作区核验任务依赖；UI 任务包含官方 `@google/design.md` CLI 的安装、版本及可运行检查，缺失时按指引补齐，规范形成后执行 lint，不以人工结构核对代替校验通过。

1. 读取 AGENTS.md、docs/native-team.md、docs/human-review.md、docs/agents/review-index.md 及目标对应的规格/工单，确定依赖与验收；恢复当前版本、指纹与确认范围。依赖的适用产物未明确确认时等待用户，探索和无关已确认工作可继续。
2. 主 Agent 核对 Spec/必要 ADR/必要 UI 原型与工单批次的明确确认；部分确认只满足对应对象，实质变更重新评审，已确认范围内小修改记录依据后自动执行。主 Agent 协调，优先选择宿主可用预定义 Profile，无法覆盖时使用动态职责，按任务通过原生工具派生必要子 Agent，提供职责与团队分派合同；实际类型与职责分别核对，不伪造按名装载。
   分派前读取插件 team-sync/SKILL.md 并登记 team/task，成功派生后关联 run。给成员实际同步路径和稳定标识，要求其读取后用自包含脚本同步；最终回复保持自然语言。Hooks为可选增强，不是业务追踪前置。
3. 使用 Codex 原生提供的 Skills 元数据，由执行 Agent 按任务选用、读取正文与必要引用；保留用户专属技能的调用边界，不预加载全部技能。
   涉及 UI 新设计/实质修改时按 docs/native-team.md 的 UE 工作流委派 UE 职责；确认图并归档设计基线后才分派依赖 UI 实施。职责与 task_name、实际 agent_type 分别回报。
4. 独立只读任务可并行，协调者收集真实身份与结果、统一落盘并运行相关检查。
5. 独立审查实际产物，对真实发现修正并复查。无 Git 基线时标明限定文件审查范围。
6. 对照规格汇总产物、实际验证、审查和限制；人工交付验收独立于设计确认和 Agent Review，保留具体交付版本待用户确认；按证据判断完成，不以可选角色自动装载阻塞团队交付。

完成标准：真实原生任务和按需技能应用产生可审查产物，满足工单验收。插件不派生 Agent、不实现调度或 Skills 装载器。
