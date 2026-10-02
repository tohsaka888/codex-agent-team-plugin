# 历史档案：已被当前方向取代

本文件仅保留历史内容，不作为当前实施指令。当前架构见 [architecture.md](../architecture.md)，第一阶段见 [phase1.md](../phase1.md)。

---
version: alpha
name: Codex Agent Team / Engineering Workspace
description: 历史方案 v0.1，已被用户否决。现有 token 仅供历史参考，内嵌宿主方案待可行性验证后重写。
colors:
  primary: "#1D4ED8"
  primary-hover: "#1E40AF"
  on-primary: "#FFFFFF"
  background: "#F5F7FA"
  surface: "#FFFFFF"
  surface-subtle: "#EEF2F6"
  text: "#172033"
  text-muted: "#526176"
  border: "#D7DFE8"
  success: "#166534"
  success-surface: "#ECFDF3"
  warning: "#92400E"
  warning-surface: "#FFFBEB"
  danger: "#B91C1C"
  danger-surface: "#FEF2F2"
  focus: "#1D4ED8"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.5
  caption:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: '"Cascadia Code", Consolas, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar: 216px
  inspector: 320px
components:
  app:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 12px
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: 36px
  metadata:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
  status-neutral:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
  status-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
  status-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  focus-indicator:
    backgroundColor: "{colors.focus}"
    size: 2px
---

# Codex Agent Team UI 规范

## Overview

**状态：上一版视觉方向已被用户否决，不作为后续实现基线。**
2026-10-01 用户明确要求内嵌 ChatGPT / Codex，继承宿主 UI；功能为 Workspace Kanban、人工评审、右侧卡片详情、实际 Agent Org Chart 和全局侧栏入口。
本文件余下 token 和布局为历史 v0.1。先完成 `docs/research/plugin-feasibility.md` 的安装与入口门槛，再重写规范和预览。

面向负责多个 agent 的工程负责人。界面首先回答：团队正在做什么、哪里需要我决定、交付是否有证据。
风格为清晰克制的工程工作台：浅灰背景、白色面板、深色文字、蓝色主要操作。中文为主，领域标识及代码保留英文。

历史方案 v0.1，2026-10-01。效果图只使用演示数据，用户已否决其视觉和信息架构。
规范依据 [Google DESIGN.md](https://github.com/google-labs-code/design.md) 的 YAML token + Markdown 双层结构，使用标准章节顺序。文件采用用户要求的小写 `design.md`。

## Colors

主要操作和当前导航使用 primary。常规内容使用 text，次要说明使用 text-muted。运行态以蓝色文字表示，已验收使用绿色，待审批或阻塞使用琥珀色，失败使用红色。
不能只靠颜色区分状态。border 只用于分隔，不作为交互控件唯一的识别线；输入边框和焦点线使用 text-muted / focus。
正文与背景对比至少 4.5:1，大字和必要图形至少 3:1。按钮、状态标签已在 token 中定义成对前景与背景。

## Typography

使用 Windows 本地字体栈，首版不依赖远程字体。标题 24px，区块标题 18px，正文 14px，控件标签 13px，辅助信息和代码 12px；主要用 400 / 600 两种字重。
长任务名最多两行，完整名称在详情中可见。时间、ID、分支名使用等宽字体或等宽数字；中文标签不强制全大写。

## Layout

桌面首选 1440 × 960，三栏布局：216px 项目导航 + 弹性主工作区 + 320px 上下文详情。顶部 64px，页面内边距 24px，区块间距 16–24px。

导航顺序：总览、任务、团队、讨论与决策、交付、设置。首版只设计必要入口；多项目入口是后续扩展位置。
总览主区按目标摘要 → 当前进度 → 团队状态 → 任务看板排列。右侧展示优先级最高的待审批项和最近事件。
任务详情保留上下文，以抽屉展示验收条件、依赖、run、worktree、文件变化和证据。

1024–1279px 隐藏常驻详情栏，改为抽屉；768–1023px 收起导航并允许任务栏横向滚动；更窄时使用单列任务列表与独立详情页。
Codex 窄面板采用单列摘要；实际能否内嵌待能力验证。独立 Web 看板与窄面板共享 token 和状态语义。

## Elevation & Depth

用底色和 1px 分隔线体现层级。卡片默认无阴影；抽屉和弹窗可用 `0 12px 32px rgba(23,32,51,0.12)`。
禁止用大面积渐变、玻璃模糊或装饰光晕承载工程状态。

## Shapes

按钮和输入 6px，面板 10px，弹窗 14px。状态标签用胶囊形。图标采用一致的 16/20px 线性样式，默认 1.5px 描边；关键图标配文字。
角色用首字或简单标记，不使用拟人化头像暗示真实成员。

## Components

- **顶部栏**：项目 / 目标、明确的连接状态、最近同步时间、暂停控制。连接断开后可读缓存，依赖在线连接的操作禁用并解释原因。
- **目标摘要**：目标、阶段、按验收完成计数的进度和下一检查点。执行活动不伪装成验收进度。
- **团队行**：角色、任务、profile、状态、最近活动。模型字段取自真实配置，不硬编码可用模型。未运行的角色显示“未启动”。
- **任务看板**：待开始、进行中、待处理、已验收四列；状态映射见下表。失败和阻塞置于待处理列并保留原始文字。首版使用操作菜单切换，避免拖拽绕过依赖与审批。
- **决策卡**：问题、推荐方案、替代方案、证据、影响和方案版本；“查看方案”打开完整内容后才能批准或退回。方案变更使旧审批失效；超时不自动批准。
- **事件列表**：时间、角色、关联任务、事件摘要；详情可看原文。按重要性筛选，不持续滚屏打断阅读。
- **交付证据**：代码 diff、测试命令与结果、独立审查、集成记录。依次区分已执行、已验收、已集成、已发布；缺少证据显示缺失。
- **表单和按钮**：显式 label；36px 默认高度，触控布局至少 44px。主按钮每个操作区域一个。提供 hover、focus、disabled、loading、error 状态；提交过程防止重复操作。
- **空态 / 加载 / 错误**：空态说明原因和下一步；加载使用静态骨架；错误给出可操作恢复路径。数据缺失不显示 0，未知用量显示“不可用”。
- **键盘与动效**：Tab 顺序匹配视觉顺序，焦点 2px + 2px 间距；弹窗管理焦点，Esc 关闭，关闭后恢复焦点。过渡 120–180ms，遵循减少动效设置，不依赖闪烁表达运行状态。

| 产品分组 | 原始任务状态 | 中文状态 |
| --- | --- | --- |
| 待开始 | queued / ready | 排队中 / 就绪 |
| 进行中 | running | 执行中 |
| 待处理 | waiting_approval / blocked / awaiting_review / repair_required / failed | 待审批 / 阻塞 / 待审查 / 待修复 / 失败 |
| 已验收 | completed | 已验收 |
| 默认隐藏，可筛选 | cancelled | 已取消 |

**首版 UE 路径**：查看目标 → 查看团队和任务 → 打开待审批方案 → 批准当前版本或退回 → 回到执行状态 → 打开交付证据。
暂停与取消分别设计，暂停进入“正在暂停”直到服务确认；取消说明影响且不假设外部副作用可撤销。

## Do's and Don'ts

- 保留任务、run、方案版本和证据之间的关联，详情能追溯。
- 所有示例数据标注“演示数据”；没有后台连接时明确显示“未连接”，不能同时声称已连接。
- 列表优先于装饰图表；确有依赖时再展示任务图。
- 安装技能不等于启动团队；技术建议不等于审批完成。
- 视觉确认不等于批准框架、后台生命周期、生产发布或预算。
- 不展示虚构的 token 用量、预计完成时间、测试结果或 native Codex 集成。

已否决的历史预览位于 `docs/ue/overview-v1.png`，提示词见 `docs/ue/prompt.md`。后续先验证宿主扩展，不继续实施本预览。
