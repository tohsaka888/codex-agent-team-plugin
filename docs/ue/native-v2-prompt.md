# 阶段二候选效果图

日期：2026-10-02。生成方式：内置 image_gen；类型：ui-mockup。状态：用户已确认 v2 视觉方向，作为阶段二实施基线。
图片是静态候选设计，不是 Codex 真实运行截图；所有任务、活动、时间与标识均为演示数据。
宿主图标栏仅表达内嵌位置，实际宿主导航由 Codex 管理，插件不替换其他入口。
最终实现以 [design.md](../../design.md) 和 [展示数据合同](../ui-data-contract.md) 为准，栅格图片不能证明键盘、主题与真实数据能力。

## 最终图片

- [Kanban 与任务详情](native-kanban-v2.png)：四列状态、选中卡片、右侧详情。
- [Org Chart 与 Agent 详情](native-org-v2.png)：示例父子关系、当前 Task、活动与技能来源。

## 完整提示记录

### Kanban 首轮

Use case: ui-mockup. Create a high fidelity desktop UI concept screenshot for a read-only Agent Team plugin embedded in Codex. Landscape 1600x1000 composition. Native Codex aesthetic: white main canvas, narrow 60px warm pale gray icon rail on left, thin graphite outline icons, organization chart icon selected in light gray rounded square. No duplicate navigation sidebar. Restrained Microsoft YaHei/Segoe UI typography, body14px, heading20px, no gradients, blue branding, oversized tiles, decorative shadows or execution buttons. Main top title "Agent Team", Workspace selector "codex-agent-team · 本机", top-right small label "演示数据", refresh outline icon and text "演示同步 14:32". Secondary tabs "Kanban" and "Agent Org Chart". All content fictional clearly demonstration. Sparse professional Jira inspired information layout with compact cards, 1px gray borders, modest10px rounding, graphite text, amber only for review, green only for completion. Bottom caption "候选设计 · 演示数据". Never show approvals, start, stop, send chat or task mutation controls. Render Chinese text accurately. Selected Kanban tab underline. Main content has 4 equal board columns on pale gray subtle background, labels "待开始 · 1", "进行中 · 2", "待评审 · 1", "执行完成 · 1". Cards: 待开始 "补充断线空态" role Developer; 进行中 "同步团队任务状态" Developer and "整理数据字段来源" Architect; 待评审 selected outlined card "审查只读数据适配" Reviewer amber chip "待评审"; 执行完成 "明确展示范围" Requirements green chip "执行完成". Each card a small task key, role, one line activity. Board occupies left 70% of content, right 360px drawer separated by thin border, heading "审查只读数据适配" and close X. Drawer task ID "UI-004", amber "待评审", labeled sections "目标" value "核对状态来源与只读边界", "负责 Agent" value "Reviewer · agent-demo-04", "当前活动" value "已输出审查意见，等待对话确认", "Skills" value "code-review · 已报告使用", "验证证据" two quiet document links "审查摘要" "字段核对记录", "活动记录" small two-row timeline 14:30 完成字段核对 14:32 报告待评审. Footer note "执行完成与评审通过分别展示". Keep spacious breathable deliberate proportions.

### Kanban 定向修正

Edit the previously generated Agent Team Kanban UI mockup. Keep the exact layout, Chinese labels, all demonstration data, four columns, and right details pane. Change ONLY all bright blue elements to neutral graphite #202020: the selected Kanban text and underline, selected card outline, document links and icons. Replace the blue letter C logo in the top left with a small graphite outlined Codex-style geometric knot icon. Overall this must resemble native Codex, no colored brand accent. Keep amber review and green completion status chips. Preserve all other typography and spacing.

### Org Chart 首轮

Use case: ui-mockup. Generate a SECOND screenshot of the same Agent Team read-only Codex plugin shown in the reference, now the Agent Org Chart tab selected. Reference image: the last generated Kanban screenshot is the design reference; preserve its exact native neutral Codex shell, narrow left icon rail, graphite branding, white canvas, font sizes, Workspace selector "codex-agent-team · 本机", header "Agent Team", top-right "演示数据" and "演示同步 14:32". Tabs "Kanban" and "Agent Org Chart", selected latter with graphite underline. No blue. Landscape1600x1000.
Main graph left70% and right360px Agent details separated by1px gray line. Graph displays one root "Coordinator" card top center: task "协调 UI 展示交付", gray pill "进行中". Below root four compact white bordered children connected by thin gray orthogonal hierarchy lines: "Requirements" task "明确展示范围" green "执行完成"; "Architect" task "整理数据字段来源" gray "进行中"; "Developer" task "同步团队任务状态" gray "进行中"; "Reviewer" task "审查只读数据适配" amber "待评审". Each card shows a tiny outlined role icon and muted fictional id "agent-demo-01" through04. Selected Developer card graphite outline. Each child displays one activity line, sufficient width to read Chinese; arrange four children in a horizontal row or two staggered rows keeping actual root branches clear. Only hierarchy edges, no dependency edges between children.
Small explanatory text above graph "执行层级 · 演示数据" and bottom "连线表示父子关系，任务依赖单独展示".
Right inspector heading "Developer" with close X, neutral "进行中". Sections "Agent 标识" value "agent-demo-03"; "父 Agent" value "coordinator-demo"; "当前 Task" value "UI-002 · 同步团队任务状态"; "当前活动" value "正在核对字段来源与状态映射"; "Skills" value "writing-for-agents · 已报告使用"; "最近活动" value "14:32 · 演示时间"; "任务详情" quiet graphite document link "查看关联任务". Bottom footer "候选设计 · 演示数据". This is a polished native software screenshot not an infographic, no hero artwork, decorative colors, glow, oversized font, chat composer, execution controls, approval buttons, costs or fabricated model names. Perfect Chinese rendering.

### Org Chart 标识修正

Edit only the identifier labels in the last Agent Org Chart screenshot. Keep all layout, colors, lines, Chinese text and right detail panel exactly unchanged. Set the root Coordinator card ID to "coordinator-demo". Set Requirements card ID to "agent-demo-01". Set Architect card ID to "agent-demo-02". Developer card stays "agent-demo-03", Reviewer card stays "agent-demo-04". Right panel Agent标识 remains "agent-demo-03" and 父Agent remains "coordinator-demo". Every Agent now has a unique id and parent id matches the root. Do not change anything else.

