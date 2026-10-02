# 总览效果图生成记录

- 日期：2026-10-01。
- 状态：历史方案 v0.1，已被用户否决；下方提示词仅保留生成记录。
- 方式：内置 image_gen；静态概念效果图，不是可运行 UI。
- 输出：`overview-v1.png`。
- 当时规范已归档至 `docs/history/design-v01-rejected.md`。当前候选规范见根目录 `design.md`，不能按此历史图片实施。
- 核心确认项：浅色工程工作台、三栏布局、团队与任务优先级、右侧审批和事件。

## 完整提示词

```text
Use case: ui-mockup
Asset type: desktop engineering dashboard concept for user confirmation, candidate v0.1
Create one polished high-fidelity straight-on desktop web interface screenshot for Codex Agent Team, landscape approximately 1440x960. Chinese UI with accurate legible simplified Chinese text, professional compact engineering workspace. No device frame, no perspective, no illustration or sci-fi styling. Warm neutral light gray #F5F7FA canvas, white #FFFFFF panels, dark navy text #172033, muted slate #526176, blue #1D4ED8 primary action, subtle #D7DFE8 borders, 10px card radii, Segoe UI / Microsoft YaHei style typography, 24px main headline, 14px body. Restrained spacing and beautiful alignment.
Layout: 216px left sidebar, flexible central area, 320px right context column, 64px header. Sidebar logo small geometric blue team icon then title "Agent Team", project "codex-agent-team", nav "总览" active blue, "任务", "团队", "讨论与决策", "交付", "设置". Bottom muted project label "候选方案 v0.1". Header breadcrumb "项目 / 总览"; visible amber badge "演示数据", connection badge "未连接", outlined disabled "暂停" button.
Central top main title "团队工作台", subtitle "让目标、执行与验收清晰可见". Goal panel title "目标：验证最小协作闭环", pill "阶段 0 · 能力验证", progress text "已验收 2 / 6 个任务", thin blue progress 33%, secondary line "下一检查点：确认执行与恢复能力". No fake financial metrics or fabricated token budgets.
Next section "团队状态" clean four compact horizontal member rows in white panel with role initials in small squares. Rows: "协调者" / "整理验收条件" / "就绪"; "架构师" / "评估执行适配器" / "执行中"; "开发者" / "等待接口验证" / "未启动"; "测试与审查" / "检查恢复证据" / "待审查". Small note "以上状态为演示". No model brand names or human photos.
Below "任务看板" with secondary tabs "看板" active and "列表", four columns "待开始 1", "进行中 1", "待处理 2", "已验收 2". Cards: pending "恢复场景测试" owner "测试与审查"; running "执行会话验证" owner "架构师" blue status "执行中"; attention two cards "UI 呈现方式" amber "待审批" and "事件采集验证" slate "待审查"; accepted two cards "领域术语整理" and "验收条件定义" green "已验收". Cards small IDs T-01 etc, sparse metadata. Accurate total 6 tasks. Tiny footer beneath board "已执行、已验收、已集成分别记录".
Right column first card amber small pill "待审批 · 演示", title "UI 呈现方式", plain explanation "优先验证 MCP Apps，保留独立看板", two visible labeled options "方案 A：内嵌面板" and "方案 B：独立看板", small metadata "方案版本 v1", primary blue button "查看方案". This button opens review; do not include automatic approval. Right second card "最近事件", fine vertical timeline 3 sample events with times and short text: "14:32 架构师开始接口验证", "14:28 协调者更新验收条件", "14:20 领域术语整理已验收"; clear small muted note "示例事件". Third small card "交付证据", 2 compact rows "文档与规格" and "测试与审查记录", caption "查看证据后确认验收".
Constraints: all operational content explicitly demo, disconnected indicator no contradictory connected status, clear text plus color for every state, generous legibility, no decoration-heavy gradient, no dark theme, no chart filler, no watermarks. Entire dashboard visible without clipping. This is a candidate concept image, not a functioning app.
```

