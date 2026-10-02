# Codex Agent Team

当前入口（2026-10-02）：用户提及 `@Agent Team` 在当前主会话启用原生团队技能；后续需求沿用，直到退出。只读 Kanban / Org Chart 按真实主会话及其全部已观察子 Agent 展示，Workspace 作为项目筛选上下文。插件 ID 为 `agent-team`；只读工具名保留兼容。入口已打包，宿主新会话的自动匹配仍须区分于代码检查通过。
基于 Codex 原生能力的多角色工程团队；后续通过内嵌只读 UI 查看 会话 Kanban、Agent Org Chart 和任务详情。


## 初版源码与本机运行

源码仓库：[tohsaka888/codex-agent-team-plugin](https://github.com/tohsaka888/codex-agent-team-plugin)。初版插件版本为 `0.5.0`。原生 Codex 对话负责团队执行，插件提供只读看板；本项目人工评审约束、当前版本依据与用户确认分别记录。会话和Workspace按最近活动倒序，无可读标题的会话隐藏；已连接旧后端通过只读查询补齐排序时间。

```powershell
npm ci
cd plugins/agent-team
npm ci
node build.mjs
node server.mjs --http
```

本机预览：`http://127.0.0.1:43782/`。没有接入原生活动时显示空态；预览不会执行任务。

Codex插件配置：将 `plugins/agent-team/.mcp.json.example` 复制为同目录 `.mcp.json`，将示例绝对路径换成实际克隆目录；插件入口为该目录 `.codex-plugin/plugin.json`。将 `.codex/hooks.example.json` 复制为 `.codex/hooks.json` 并替换脚本路径，按宿主要求启用项目Hook采集。该配置是本机安装输入，不宣称自动全局安装。Node.js须支持 `node:test`、`fetch` 和 `AbortSignal.timeout`（本机验证使用Node 24）。

Git忽略依赖、构建输出、`.runtime/`、本机MCP/Hook配置、Python缓存及临时回报脚本；设计/spec/工单与验证记录保留。第三方Matt Skills的固定来源和MIT许可见 `docs/agents/skills.md` 及 `docs/agents/mattpocock-LICENSE`。历史POC仅作研究证据，当前原生只读路线见 `docs/architecture.md`。

## 当前方向与阶段

用户已确定：任务触发、协调、子 Agent 派生与执行全部交给 Codex；UI 只查看。暂不需要独立编排服务、持久任务数据库、严格审批门槛或关闭 App 后继续运行。
第一阶段先完成本机原生团队闭环，包含子 Agent 预设、Skills 装载、协作与工程交付。用户已确认原生 Codex 对话是验收入口，UI 与 SSH 不阻塞这一阶段。

已完成前期协作配置、31 个固定版本 Matt Skills 安装和最小 MCP/UI 探针。五份可选原生角色预设及项目团队入口已创建。本机原生分派、按需 Skills、并行、限定审查与配置交付已有真实证据；用户澄清后，自动按角色名装载不再作为验收门槛。阶段一工单已按实际证据核对，见 [原生设计对齐](docs/research/native-design-alignment.md)。
侧栏入口、内嵌握手、Workspace 页面切换与刷新已有证据。本次真实原生团队的启动/停止、父子关系、任务、技能回报及审查返工已进入安装插件，见 [真实团队交付证据](.scratch/readonly-team-ui/evidence/03-team-run.md)；宿主断线恢复与完整阶段二验收仍待收尾。历史独立执行器结果不代表正式团队能力。

## 落地顺序

1. 按 Matt `to-spec` 收敛阶段一规格，明确角色、Skills 边界和可观察验收；[规格](.scratch/native-agent-team/spec.md)已生成。
2. 按 `to-tickets` 拆分可独立验收的协作场景，确认粒度与依赖后发布本地工单。
3. 通过原生任务指令与可选角色配置表达职责，由 Codex 发现 Skills、Agent 按需使用，完成最小真实闭环。
4. 逐步加入并行、审查返工与完整角色，按适用情况使用 `tdd`、`diagnosing-bugs` 和 `code-review`。
5. 原生团队交付可靠后，再接轻量事件采集及只读 UI；SSH 展示单独集成。

## 文档入口

- [架构](docs/architecture.md)：当前职责、数据流与边界。
- [第一阶段](docs/phase1.md)：角色、Skills 矩阵、实施顺序和验收。
- [第二阶段](docs/phase2.md)：已确认规格与五个正式工单，01 内嵌验收完成，UI 修正与后续验收进度。
- [展示数据合同](docs/ui-data-contract.md)：原生数据来源、状态投影与刷新。
- [团队使用合同](docs/native-team.md)：角色选择、单写入者、结果证据及使用限制；项目入口为 `native-agent-team` Skill。
- [交接](docs/handoff.md)：下一会话从哪里继续。
- [协作规则](AGENTS.md)、[领域词汇](GLOSSARY.md)、[UI 规范](design.md)。
- [Skills 来源与适配](docs/agents/skills.md)、[本地工单](docs/agents/issue-tracker.md)。
- `docs/research/`：历史实测与接口参考；以当前规格确定适用范围。
- `docs/history/`、`docs/ue/overview-v1.png`：已被取代的历史方案，非实施基线。

## 文档与探针检查

整体 UI 彩色精修已实现并更新本机插件：统一双色职责 SVG、彩色页签、阶段细线、角色选中描边与轻量交互动效。浅/深主题、窄屏、减少动效、模拟断线及跨同步焦点已核对，相关24项检查和独立限定审查通过；见 [交付记录](.scratch/ui-color/delivery.md)。重新打开看板加载新资源，用户最终视觉验收待确认。

会话视图动效升级已按确认的三项工单实现，0.4.0 已本机安装：固定节点的可平移/缩放画布、关系高亮与短程飞线、详情展开避让，以及真实状态驱动的 Kanban 动画。团队与验收证据见 [动效交付](.scratch/ui-motion/delivery.md)。

验收反馈与 v2 视觉对齐现已实施：顶部范围工具行、整高独立滚动的四列、职责图标与紧凑卡片、业务信息优先的独立详情、空白关闭、短尾粒子飞线及同职责历史实例汇总。0.4.2 安装与验证记录见 [本轮交付](.scratch/ui-acceptance-fixes/delivery.md)。原生列表展示执行实例及宿主名称，看板筛选职责；执行配置未报告时保持未知。

0.5.0 增加执行会话链接、已关联文件只读预览、逐项验收 checklist 与 Agent/人工评审时间线，详情采用固定标题及独立正文滚动，移除顶部刷新/减少动效按钮。文件原生编辑器直达未开放，预览不会启动模型或修改任务；回报方式见 [合同](docs/ui-data-contract.md#验收评审与导航)，本轮证据见 [交付](.scratch/ui-traceability/delivery.md)。

使用入口：在原生对话调用 `native-agent-team` Skill，并给出具体目标与验收。Skills 发现和任务执行沿用 Codex；角色 TOML 为可选定制，不要求插件按角色名加载。入口是原生工作流辅助，插件本身只展示，详见团队合同。

首次安装文档工具执行 `npm ci`；设计校验执行 `npm run design:lint`。
只读插件位于 `plugins/agent-team/`：`node build.mjs` 构建页面；`node --test native-state.test.mjs org-view.test.mjs view-model.test.mjs sync-query.test.mjs readonly-mcp.test.mjs workspace-registry.test.mjs canvas-interaction.test.mjs` 检查当前查询/展示与几何边界。实际原生团队能力另有分派、Hook、回报及安装插件证据。`review-gate.test.mjs` 仅属历史规则，不代替正式验收。
不再启动探针的独立执行器测试来代替第一阶段交付。根 package 仅管理文档校验工具，不表示应用框架已选定。

项目及 marketplace 名称为 `codex-agent-team-plugin`，插件 ID 为 `agent-team`，源码目录为 `plugins/agent-team`。旧名称安装的插件需按新 ID 重新安装；历史验收记录保留当时名称。
