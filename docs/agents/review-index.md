# 项目评审索引

协调者在分派、返工和恢复时先核对此表，再读实际原文。此索引不是调度数据库；缺失证据保持未知。

| 对象 | 当前版本 | 决定与依据 | 影响范围 |
| --- | --- | --- | --- |
| 人工评审 feature Spec | v1 | 已确认；用户“确认”；[评审原文](../../.scratch/human-review/approved-v1/spec-reviewed.md) | 本 feature 全部工单 |
| 工单批次 | v1，五条 | 已确认；同次“确认”；[评审原文](../../.scratch/human-review/approved-v1/ticket-plan-reviewed.md) | 01→02→03；04/05依赖03 |
| UI 原型 A+B | v2，variant=D | 已确认；用户“可以”；[评审原文](../../.scratch/human-review/prototype-v2-reviewed.html) | 正式 UI 展示 |
| ADR | 不适用 | 协调者：本轮沿用原生执行及只读展示，未新增关键架构取舍 | 无额外 ADR 实施条件 |
| 人工交付验收 | v1 | 已确认；用户“确认交付”；[具体交付](../../.scratch/human-review/delivery.md)，工程与待验证场景分别列出 | 本 feature 最终验收 |
| 可移植追踪重构 Spec/ADR/工单批次 | v2，四条 | 已确认；用户“确认全部 v2，按四条工单实施”；[版本及SHA256](../../.scratch/profile-native-refactor/review-v2.md) | 通用核心→多执行→证据确认→迁移和README；验证边界为公开同步命令→快照→同一UI |

精确指纹、原话和范围见 [决定记录](../../.scratch/human-review/decisions.md)。执行规则见 [人工评审流程](../human-review.md)。本表中设计确认不等于交付验收。以前缺少版本的任务保持原记录，不追认。

## 全量依赖 DAG v1（2026-10-04，待确认）
对象：.scratch/org-dag/spec-v1.md、prototype-v1.html、tickets-v1.md；SHA256 见 review-v1.json。原型来自 Lyria 09:51 真实快照，正式实施尚未放行。职责和裁切常规修复已完成，详见 delivery-v1.md。

## 全量依赖 DAG v1（反馈与实施）
用户原话与范围：.scratch/org-dag/decision-v1.md；认可展示方向，附带原版 UI、箭头及居中要求。已在该范围实现并安装，验证见 delivery-v2.md。最终人工交付验收仍独立保留。
