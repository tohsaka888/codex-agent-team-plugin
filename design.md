---
version: alpha
name: Codex Agent Team / Native Read-only View
description: 阶段二只读界面规范，继承 Codex 宿主风格；本机验收边界与 v2 视觉方向已确认，正式界面实施中。
colors:
  primary: "#202020"
  primary-hover: "#3A3A3A"
  on-primary: "#FFFFFF"
  background: "#FFFFFF"
  surface: "#FFFFFF"
  surface-subtle: "#F5F5F5"
  text: "#202020"
  text-muted: "#626262"
  border: "#D8D8D8"
  success: "#166534"
  success-surface: "#ECFDF3"
  warning: "#92400E"
  warning-surface: "#FFFBEB"
  danger: "#B91C1C"
  danger-surface: "#FEF2F2"
  focus: "#202020"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: 16px
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
  inspector: 360px
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

当前入口（2026-10-02）：用户提及 `@Agent Team` 在当前主会话启用原生团队技能；后续需求沿用，直到退出。只读 Kanban / Org Chart 按真实主会话及其全部已观察子 Agent 展示，Workspace 作为项目筛选上下文。插件 ID 为 `agent-team`；只读工具名保留兼容。入口已打包，宿主新会话的自动匹配仍须区分于代码检查通过。
# Codex Agent Team UI 规范

## Overview

用户于 2026-10-02 确认 v2 视觉方向，作为阶段二实施基线；细节以宿主可用主题和实际界面验收为准。阶段一原生团队闭环已有交付；阶段二实现内嵌 Codex 的只读团队视图，见 [阶段二](docs/phase2.md) 与 [展示数据合同](docs/ui-data-contract.md)。
执行、派生、协作、权限确认均由原生 Codex 对话承担。插件只展示 会话 Kanban、Agent Org Chart 和任务详情。
旧 v0.1 已否决，保存在 [历史规范](docs/history/design-v01-rejected.md)；历史效果图不是当前目标。
沿用 Google DESIGN.md 的 YAML token 与 Markdown 结构。
阶段二已确认的效果图：[Kanban 与详情](docs/ue/native-kanban-v2.png)、[Org Chart 与详情](docs/ue/native-org-v2.png)；均为演示数据，生成提示见 [记录](docs/ue/native-v2-prompt.md)。

## Colors

优先使用宿主提供的主题变量。上方 token 是浅色主题的候选回退值，深色主题必须跟随宿主适配，不能固定白色画布。
主文字、选中导航采用中性色；绿色表示有证据的完成，琥珀色表示待评审或阻塞，红色表示失败。
状态必须同时显示文字。正文对比至少 4.5:1，必要图形至少 3:1；颜色不能独自表达状态。

## Typography

优先继承宿主字体与字号；回退使用 Segoe UI / Microsoft YaHei。标题 20px，区块标题 16px，正文 14px，辅助文字 12px。
任务标题最多两行，详情展示完整标题。标识与时间使用等宽数字，正文中文不强制大写。

## Layout

会话内工具卡片是主要入口，可展开宿主面板；界面内部不复制项目侧栏。Workspace 提供筛选上下文，主会话及其已观察后代决定团队范围。
顶部为 Workspace、会话范围、连接状态和同步时间；下方为 Kanban / Agent Org Chart 标签页。
Kanban 采用待开始、进行中、待评审、执行完成四个分组；失败和阻塞保留明确原始状态。
点击卡片在右侧打开详情，参考 Jira 的列表与详情联动，保留筛选和滚动位置。
宽屏详情建议 360px；窄屏改为抽屉或独立详情视图，看板允许横向滚动。
看板与详情分别滚动，页面框架固定；详情到达边界不带动整个页面。嵌入宿主时仅保留宿主标题，独立预览保留一个页面标题。
Workspace 标识包含主机与路径，避免本机和 SSH 同名项目混淆。

## Elevation & Depth

底色与 1px 分隔线体现层级，卡片默认无阴影；详情抽屉可用轻微阴影。
保持宿主的克制样式，避免大面积装饰性渐变、玻璃模糊和光晕。2026-10-02 用户授权增加彩色动态图标：职责采用低饱和底色与双色 SVG，卡片允许轻微阴影，选中描边沿用职责色。

## Shapes

使用宿主一致的线性图标与圆角。回退按钮 6px、卡片 10px；图标 16/20px、约 1.5px 描边。
Agent Team 入口使用组织结构图标；关键状态和图标配文字。协调、需求、架构、开发、审查职责依次采用紫、青、蓝、靛、绿的浅/深双色 token；未知职责使用中性人物图形。角色颜色不表示执行状态。

## Components

- **Workspace 选择器**：展示主机、项目名，切换仅改变查看范围；默认自动同步，异常状态可重试。
  使用自定义列表弹层，补充路径说明；鼠标焦点不出现外围黑框，键盘焦点以内描边呈现，支持方向键、Home/End、Tab 与 Esc。
- **Kanban 卡片**：任务标题、角色、真实执行状态、最近活动；点击查看详情，不拖拽修改执行状态。
- **详情面板**：目标、验收条件、父子关系、当前活动、Skill 与 Profile、实际产物和验证证据；缺失字段明确标记。
- **Org Chart**（2026-10-04 全量 DAG）：默认按已回报任务依赖展示工单及全部执行，单独切换全部真实 Agent 与原生父子关系；两种边不混用。真实身份、执行记录与工单分别计数，不按最新职责隐藏历史执行。保留原版卡片、配色、飞线和画布交互，各层节点居中，内容高度实测适配，箭头在目标卡片上方留间距。未知或循环关系明确标注，不补造依赖。仅拖动空白平移，支持缩放、适配全图、定位选中及键盘导航。用户依据见 `.scratch/org-dag/decision-v1.md`。
  点击角色强调直属关系与祖先路径，细曲线承载短尾粒子飞线，最多强调 8 条关联、每次 2.4 秒播放 3 轮后消失，可暂停；飞线不表示真实消息传输。刷新保留视口与职责选择，不因最新实例切换丢失选择。
  点击空白关闭详情，画布拖动不误关；详情内交互、选择器和工具按钮不触发关闭。内嵌页保留顶部及左右 24px 间距，窄视口使用顶部 20px、左右 16px。
  对齐已确认 v2 图：范围选择器并列为紧凑工具行，正常同步信息降为辅助提示；四列铺满剩余高度、卡片区域各自滚动、列标题固定。卡片编号与职责图标同一头行，标题及活动摘要最多两行，完整信息保留详情。详情先展示状态、目标/最近任务、活动及验证证据，执行实例、UUID、原生类型和未报告执行配置置于可展开区域。职责图标是本项目视觉标识，不冒充宿主子 Agent 的图标。
  详情展开前先按未来面板范围计算安全矩形，最小平移选中节点，再展开详情；从总览选中时恢复至少 100% 阅读比例，窄屏使用底部面板。空间不足时使用独立详情，连续选择以最后一次为准，关闭取消待展开事务。
- **评审记录**：独立展示 Agent/人工与方案/交付，保留评审者、结论、反馈、依据、时间和执行链接；缺失标记未接入。验收条件为只读 checklist，明确逐项依据后勾选，人工交付确认单列。
- **可追溯详情**：固定且不透明的标题，正文独立滚动；6px 圆角无箭头滚动条与宿主风格一致，面板右缘贴齐视口。任务和 Org 历史按真实 UUID 打开执行会话，产物文件链接打开已关联文件预览；原生编辑器直达未开放。顶部刷新和减少动效按钮移除，保留自动同步、异常重试及系统减少动效。
- **刷新**：页面可见时默认每 10 秒同步，隐藏暂停、恢复立即刷新；防止请求重叠与旧项目响应覆盖。连接失败保留最近同步时间，旧数据明确标记，重试退避上限 60 秒。
- **状态与空态**：区分无任务、未连接、正在加载和数据不可用；缺失用量不能显示为零。
  空态使用任务阶段引导、居中说明卡、组织图标、只读刷新与可展开的数据范围，避免仅一行文字留下整页空白。阶段引导不伪造任务数量或 Agent。
- **只读交互**：允许切换、筛选、展开、查看与刷新；按钮的主要样式只用于这些查看行为。
- **键盘与动效**：焦点可见、Tab 顺序与布局一致，Esc 关闭详情并恢复焦点；遵循减少动效设置。

## Do's and Don'ts

用户已确认画布与动效方案及三项工单，正式实现见 [规格](.scratch/ui-motion/spec.md)、[动效调研](docs/research/ui-motion-canvas.md) 和 [交付证据](.scratch/ui-motion/delivery.md)。颜色继续继承宿主 token。
正式动效参数：角色避让 240ms、详情展开 180ms、卡片真实转列 380ms，错峰上限 120ms；微反馈与状态强调仅短时出现。采用 transform/opacity，避免循环闪烁。
彩色图标精修：卡片悬停与键盘聚焦采用内部图形 180ms 状态过渡；页签悬停播放一次 480ms 轻微摆动。相同快照重建不重播关键帧。隐藏、同步失败或系统减少动效时清除装饰图标动画与位移，保留完整静态图形；不改变 Org 节点尺寸。
Kanban 只在同会话稳定 Task ID 的真实状态变化后迁移，先更新语义，再播放过渡；不补造评审等中间阶段。初载、筛选、切换和相同快照不演出状态流转。
系统减少动效停止位移、飞线和迁移，Org 可单独关闭飞线，保留状态文字及关系高亮；页面隐藏或同步失败停止装饰动画。图表视口只保存在当前页面中。

- 所有演示数据明确标记“演示数据”，实际执行状态必须有来源和时间。
- 区分执行完成、评审通过、集成和发布，不从进程退出推断后续状态。
- 不提供 Codex 任务控制，不建立插件审批门槛，不声称关闭 App 后可继续执行。
- 不将已保存 SSH 项目列表当作实时远程执行证据。
- 不显示虚构的模型、用量、完成时间或父子关系。
- 第一阶段的 Agent 交付不依赖这份视觉规范；阶段二效果图方向已确认，工单拆分确认后实施。
