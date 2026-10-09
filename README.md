# Codex Agent Team

当前重构采用宿主原生团队 + 五个可移植 Skills（setup-agent-team、agent-team、team-sync、team-review、team-ue）+ 通用同步脚本。Codex 使用内嵌插件；其他客户端使用同一 Skills 和独立只读 Web。Hooks仅是可选生命周期观察，Agent 最终回复不要求专用 JSON。完整协议与边界见 [可移植追踪](docs/portable-tracking.md)。

## Codex 安装插件

需要 Node.js 24（本机验证版本）、npm 和支持插件的 Codex。先克隆源码并安装构建依赖：

```powershell
git clone https://github.com/tohsaka888/codex-agent-team-plugin.git
cd codex-agent-team-plugin
npm ci
Push-Location plugins/agent-team
npm ci
node build.mjs
Pop-Location
```

将 `plugins/agent-team/.mcp.json.example` 复制为同目录 `.mcp.json`，将 args 中 server.mjs 改成实际绝对路径；Node 不在宿主 PATH 时 command 也填实际绝对路径。已有 `.mcp.json` 先核对，不覆盖自定义配置。然后在仓库根目录执行：

```powershell
codex plugin marketplace add .
codex plugin add agent-team@codex-agent-team-plugin
codex plugin list --marketplace codex-agent-team-plugin --json
```

marketplace 入口为 `.agents/plugins/marketplace.json`，插件入口为 `plugins/agent-team/.codex-plugin/plugin.json`。安装命令已通过本机 CLI 帮助核对；安装后在新会话核对五个 Skills 和只读工具实际可见，再说“使用 Agent Team 完成……”。已有会话不保证自动重读新版指引。

想安装项目级原生角色预设时，明确目标工程并执行下列命令；它保留所有已存在的 Skill/Profile，不修改全局规则：

```powershell
node plugins/agent-team/install-skills.mjs --workspace D:/Projects/MyApp --codex-profiles
```

预设包括 Coordinator、Requirements、Architect、Developer、Reviewer、UE。Codex实际发现/派生能力以当前会话工具为准，Profile不匹配时仍可使用动态职责。项目 Skills 与插件 Skills 两种安装方式择一；有重复或旧副本时核对宿主实际选中的版本。工程流程需要的 Matt Skills 单独核验，来源、许可及安装边界见 [Skills说明](docs/agents/skills.md)。

## 非 Codex 使用 Skills 和独立 Web

同样安装上面的 Node 依赖并构建页面，无需安装 Codex 插件。将五个 Skills 安装到目标客户端真实支持的目录；默认使用目标项目 `.agents/skills`，也可明确指定目录：

```powershell
node plugins/agent-team/install-skills.mjs --workspace D:/Projects/MyApp --target D:/Projects/MyApp/.agents/skills
node plugins/agent-team/server.mjs --http --portable --workspace D:/Projects/MyApp
```

浏览器打开 `http://127.0.0.1:43782/`。默认数据目录为目标项目 `.agent-team`；自定义时同步命令和 Web 都传相同 `--data-dir`。需要不同端口时设置 `AGENT_TEAM_PREVIEW_PORT`。其他页面嵌入看板可显式打开 `/?transport=http`，避免将任意 iframe 当成 Codex。

在客户端显式调用 agent-team；没有原生 Skills 发现机制时，明确要求读取已安装的 `agent-team/SKILL.md`。协调者派生子 Agent 时提供 `team-sync/SKILL.md` 和脚本实际路径及团队/工单/运行标识，要求读取、同步并核对。客户端仍需提供真实原生子 Agent 工具；本项目不另建执行器。隐式匹配依赖客户端，不能承诺每次自动加载。

以下命令可验证完整最小接入（工单没有运行时也会展示待开始）：

```powershell
$syncScript = 'D:/Projects/MyApp/.agents/skills/team-sync/scripts/sync.mjs'
node $syncScript team --workspace D:/Projects/MyApp --team-id my-app --title 'My App' --provider common
$taskAc = '[{"id":"tests","label":"首页行为单元回归通过","method":"运行首页单元测试并记录命令、文件和结果","verifier":"agent","kind":"unit_test"},{"id":"delivery","label":"首页今日入口可进入学习页面","method":"查看页面并回报操作结果","verifier":"human","kind":"delivery","manualCheck":{"entry":"学习App首页","steps":["启动App","点击今日学习入口"],"expected":"进入今日课程列表并显示课程标题，无空白或错误页"}}]'
node $syncScript task --workspace D:/Projects/MyApp --team-id my-app --task-id 01 --title '实现首页' --goal '依据已确认UI实现首页' --role Developer --task-type code --version ac-v1 --acceptance-items $taskAc
node $syncScript run --workspace D:/Projects/MyApp --team-id my-app --task-id 01 --run-id developer-1 --provider common --role Developer --agent-name home_development --profile developer --title 首页行为实现 --task-type code --version ac-v1 --acceptance-items $taskAc
node $syncScript activity --workspace D:/Projects/MyApp --team-id my-app --task-id 01 --run-id developer-1 --summary '正在核对首页实现'
node $syncScript acceptance --workspace D:/Projects/MyApp --team-id my-app --task-id 01 --item-id tests --status pending
node $syncScript read --workspace D:/Projects/MyApp
```

上述是使用示例，不是预置演示数据。真实团队还应提交具体逐项证据、运行结束和独立业务阶段更新；review-requirement 计算实际文件指纹并保存快照，人工 review 引用用户原话和具体版本。完整参数用 `node $syncScript --help` 查看。同步脚本自包含，只复制 team-sync 目录也能运行，不依赖插件缓存或 Codex SQLite。

Claude Code、Hermes、DSH 等使用此通用路径，无需逐家 Hook 适配器；各家技能目录、隐式发现及原生派生能力需实际核验。本轮通用 CLI/HTTP/浏览器验证与各客户端真实会话验证分别记录，未运行的客户端不标为已完整实测。

本轮实际验证：本机94项检查、AI21项相关检查、lint/格式/构建，以及真实归档浏览器的四列/窄屏/多执行详情/组织图/HTTP嵌入通过；预定义与动态成员已实际读取并同步Skill。其他客户端真实会话和Codex宿主完整内嵌视觉仍待核验，见 交付与限制（本机记录：`.scratch/profile-native-refactor/delivery-v2.md`）。已有插件副本更新后须重连MCP、重开看板，并在新会话核对新版Skills发现。

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

可选 Codex Hook观察：参考 `.codex/hooks.example.json`，替换脚本路径并按宿主要求配置与信任后采集。无需 Hooks 即可通过 team-sync 使用完整业务追踪；不同客户端 Hook 协议不统一，不复制配置冒充通用。Node.js须支持 `node:test`、`fetch` 和 `AbortSignal.timeout`（本机验证使用Node 24）。

Git忽略依赖、构建输出、`.runtime/`、本机MCP/Hook配置、Python缓存及临时回报脚本；设计/spec/工单与验证记录保留。第三方Matt Skills的固定来源和MIT许可见 `docs/agents/skills.md` 及 `docs/agents/mattpocock-LICENSE`。历史POC仅作研究证据，当前原生只读路线见 `docs/architecture.md`。

## 当前方向与阶段

用户已确定：任务触发、协调、子 Agent 派生与执行全部交给 Codex；UI 只查看。暂不需要独立编排服务、持久任务数据库、严格审批门槛或关闭 App 后继续运行。
第一阶段先完成本机原生团队闭环，包含子 Agent 预设、Skills 装载、协作与工程交付。用户已确认原生 Codex 对话是验收入口，UI 与 SSH 不阻塞这一阶段。

已完成前期协作配置、31 个固定版本 Matt Skills 安装和最小 MCP/UI 探针。五份可选原生角色预设及项目团队入口已创建。本机原生分派、按需 Skills、并行、限定审查与配置交付已有真实证据；用户澄清后，自动按角色名装载不再作为验收门槛。阶段一工单已按实际证据核对，见 [原生设计对齐](docs/research/native-design-alignment.md)。
侧栏入口、内嵌握手、Workspace 页面切换与刷新已有证据。本次真实原生团队的启动/停止、父子关系、任务、技能回报及审查返工已进入安装插件，见 真实团队交付证据（本机记录：`.scratch/readonly-team-ui/evidence/03-team-run.md`）；宿主断线恢复与完整阶段二验收仍待收尾。历史独立执行器结果不代表正式团队能力。

## 落地顺序

1. 按 Matt `to-spec` 收敛阶段一规格，明确角色、Skills 边界和可观察验收；规格（本机记录：`.scratch/native-agent-team/spec.md`）已生成。
2. 按 `to-tickets` 拆分可独立验收的协作场景，确认粒度与依赖后发布本地工单。
3. 通过原生任务指令与可选角色配置表达职责，由 Codex 发现 Skills、Agent 按需使用，完成最小真实闭环。
4. 逐步加入并行、审查返工与完整角色，按适用情况使用 `tdd`、`diagnosing-bugs` 和 `code-review`。
5. 原生团队交付可靠后，再接轻量事件采集及只读 UI；SSH 展示单独集成。

`.scratch/` 仅保存本机临时工作与评审记录，不随仓库发布；文中标注的本机记录需在原工作区查阅，新克隆不包含这些文件。需长期共享的正式资料应另行整理到 `docs/`。

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

代码规范检查：根目录运行 `npm run lint`（ESLint）、`npm run format:check`（Prettier）；`npm run format` 整理插件 JavaScript、HTML、CSS 和测试。页面骨架见 `plugins/agent-team/web/board.html`，基础样式见 `web/base.css`；卡片、空态与详情分别在 `cards-view.mjs`、`empty-view.mjs`、`detail-view.mjs`。构建输出按生产资源打包，不作为手写源码维护。根 `npm ci` 安装规范与 DOM 测试工具；全部单元检查可用 `node --test plugins/agent-team/*.test.mjs`。

整体 UI 彩色精修已实现并更新本机插件：统一双色职责 SVG、彩色页签、阶段细线、角色选中描边与轻量交互动效。浅/深主题、窄屏、减少动效、模拟断线及跨同步焦点已核对，相关24项检查和独立限定审查通过；见 交付记录（本机记录：`.scratch/ui-color/delivery.md`）。重新打开看板加载新资源，用户最终视觉验收待确认。

会话视图动效升级已按确认的三项工单实现，0.4.0 已本机安装：固定节点的可平移/缩放画布、关系高亮与短程飞线、详情展开避让，以及真实状态驱动的 Kanban 动画。团队与验收证据见 动效交付（本机记录：`.scratch/ui-motion/delivery.md`）。

验收反馈与 v2 视觉对齐现已实施：顶部范围工具行、整高独立滚动的四列、职责图标与紧凑卡片、业务信息优先的独立详情、空白关闭、短尾粒子飞线及同职责历史实例汇总。0.4.2 安装与验证记录见 本轮交付（本机记录：`.scratch/ui-acceptance-fixes/delivery.md`）。原生列表展示执行实例及宿主名称，看板筛选职责；执行配置未报告时保持未知。

0.5.0 增加执行会话链接、已关联文件只读预览、逐项验收 checklist 与 Agent/人工评审时间线，详情采用固定标题及独立正文滚动，移除顶部刷新/减少动效按钮。文件原生编辑器直达未开放，预览不会启动模型或修改任务；回报方式见 [合同](docs/ui-data-contract.md#验收评审与导航)，本轮证据见 交付（本机记录：`.scratch/ui-traceability/delivery.md`）。

使用入口：在原生对话调用 `native-agent-team` Skill，并给出具体目标与验收。Skills 发现和任务执行沿用 Codex；角色 TOML 为可选定制，不要求插件按角色名加载。入口是原生工作流辅助，插件本身只展示，详见团队合同。

首次准备目标工作区时，显式调用 `$setup-agent-team`（例如“使用 setup-agent-team 为当前项目安装团队技能依赖”），由 Agent 明确说明调用并检查、安装缺失项。标准工程 Skills 默认按固定来源安装，其他技能和 UI 工具按需求补齐；已有文件保留。插件携带[安装入口](plugins/agent-team/skills/setup-agent-team/SKILL.md)及来源清单，未捆绑31个上游技能正文。日常 `@Agent Team` 对话按[Matt 流程指引](plugins/agent-team/skills/agent-team/references/matt-workflow.md)推进，不再执行整套环境预检；实际缺失依赖仅影响相应阶段。跨项目/SSH 的安装必须在实际目标主机执行。文件同步不代表既有会话已重新读取或新会话已实测。

首次安装文档工具执行 `npm ci`；设计校验执行 `npm run design:lint`。显式 setup-agent-team 的 UI 安装范围包含官方 `@google/design.md` CLI 的项目级安装、版本与可运行检查；本仓库固定为 `0.4.0`，其他工作区/SSH 环境按[补齐指引](plugins/agent-team/skills/setup-agent-team/references/dependencies.md#补齐-designmd-cli)安装。业务阶段仍运行规范 lint，人工结构核对不能替代 CLI 校验通过。
只读插件位于 `plugins/agent-team/`：`node build.mjs` 构建页面；`node --test native-state.test.mjs org-view.test.mjs view-model.test.mjs sync-query.test.mjs readonly-mcp.test.mjs workspace-registry.test.mjs canvas-interaction.test.mjs` 检查当前查询/展示与几何边界。实际原生团队能力另有分派、Hook、回报及安装插件证据。`review-gate.test.mjs` 仅属历史规则，不代替正式验收。
不再启动探针的独立执行器测试来代替第一阶段交付。根 package 仅管理文档校验工具，不表示应用框架已选定。

项目及 marketplace 名称为 `codex-agent-team-plugin`，插件 ID 为 `agent-team`，源码目录为 `plugins/agent-team`。旧名称安装的插件需按新 ID 重新安装；历史验收记录保留当时名称。


## 强制 AC 与人工结果验收

Web/App 界面实现、视觉/交互修改及 UI 修复要求 [UI Check](plugins/agent-team/skills/team-review/references/ui-check.md)：Reviewer 逐对查看用户确认的 UI 图与当前产品实际运行截图，同时核对 design.md、ux.md 和交互。工单与相关执行卡登记具体 AC，保存覆盖矩阵、图片对、差异及修正复查证据；缺少必需证据保持未通过。这是 Agent 工作流规则，不是插件自动图像检测功能。

每张父工单和独立执行卡都必须有非空 AC；登记时原子提供角色、工作类别、AC 版本和具体核对方法。编码任务必需实际通过的单元测试，UE 必需用户确认具体版本原型。每卡包含 Agent 自验证项和人工结果验收项。新流程及 result 文件指纹/独立 run 证据命令见[同步验收合同](plugins/agent-team/skills/team-sync/references/acceptance.md)。

Agent 逐项验证并完成独立审查后提交用户，明确确认当前卡片/结果版本才能业务完成；同一次回复可确认列明的多卡，分别回报。原生执行完成与验收完成独立，旧卡缺失显示“AC 缺失 · 待补齐”，不会自动追认。更新 Skills 后已有会话需重新读取；源码通过不代表安装缓存已更新。


2026-10-04 人工核验细化（覆盖旧版每卡人工确认约定）：每卡仍须非空具体 AC 和 Agent 自验证；仅需人工核验的功能添加 human 条件，manualCheck 必填 entry、steps、expected。无需人工核验的卡不添加通用确认项，显示“无需人工核验”。UE 原型确认等适用要求保留；不得删除真实人工核验需求规避验收。详见 [强制验收合同](plugins/agent-team/skills/team-sync/references/acceptance.md)。
