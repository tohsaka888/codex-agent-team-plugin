# 阶段 0 验证记录

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

最终端到端结论已收口于 `final-feasibility.md`；当前安装版本 0.1.7。以下为历史分段记录。

日期：2026-10-01。当前探针安装版本：0.1.6。此文区分实测能力、用户截图证据和未验收事项。

最新执行、中断恢复和评审规则验证见 `poc-closure.md`。本机执行 8 项检查通过；人工门槛为自动测试夹具验证，真人交互未接入。以下历史记录按其版本理解。

## 已通过

| 能力 | 证据 | 实测边界 |
| --- | --- | --- |
| 本地 marketplace 安装、插件可发现 | 用户能 @Agent Team Probe；CLI 安装返回版本和缓存路径 | 仅当前 Windows 本机 |
| 已安装插件加载 MCP 服务 | `plugin-load-probe.json`：installedMcpLoaded、toolsDiscovered 均为 true | 单独启动的 App Server，不等于桌面正在运行的实例 |
| MCP UI 资源、global/thread 入口元数据 | `plugin-load-probe.json`：资源及两个入口元数据检查通过 | thread 面板呈现尚未单独验收 |
| 左侧入口打开宿主内全屏页面 | 用户提供截图 `sidebar-open-v012.png`，并确认“可以打开” | 截图仍显示“正在检测宿主桥接”和 Workspace“加载中” |
| 服务端读取真实 Workspace 列表 | `mcp-probe.json`：工具调用无错误，projectCount=2 | 不代表 iframe 已收到数据或切换成功 |
| 宿主 UI 握手和本机项目数据加载 | 用户 0.1.4 截图 `host-data-v014.png` 显示“已完成 MCP Apps 宿主握手”、选中本机项目及看板列 | 远程清单、定时刷新为下一版新增能力 |

## 本次修复与待复测项

0.1.0/0.1.1 可被发现，但本机插件详情的 MCP 清单为空。改用 `.codex-plugin/plugin.json` 显式引用 `.mcp.json` 后，0.1.2 的 MCP 发现检查通过。此为本机版本兼容实测，不外推为所有版本对 portable manifest 的支持结论。

0.1.3 新增 `assets/team.svg`，将插件 composerIcon、logo 和 MCP server icons 指向团队节点图。图标最终是否更新仍由桌面宿主呈现确认。

针对截图的加载停滞，将浏览器 bundle 改为经典 IIFE 脚本，异步初始化在函数内执行；增加脚本启动诊断和 10 秒握手超时；更新资源 URI 避免旧 HTML 缓存。此修改针对兼容性排查，尚未证明原故障确由模块脚本加载造成。

重新启动 Codex 并打开看板后，应看到“已完成 MCP Apps 宿主握手”、Workspace 名称和空看板列。若失败，页面应显示具体失败环节，不能把空白页面视为数据链路通过。

### 0.1.4：定位并修复 HTML 构建损坏

用户后续截图确认团队图标已经更新，但内容区仅剩宿主标题。检查 0.1.3 生成文件发现 18 个 doctype 和 22 个未替换的 BUNDLE 标记；抽取脚本进行语法解析失败，报 `Invalid or unexpected token`。

根因是 `String.replace` 的 replacement 字符串会解释 bundle 中的 `$&`、`$\x60`、`$'`，把原 HTML 等内容重复插入 JavaScript。0.1.4 改为函数回调返回原样 bundle，并在写入文件前检查脚本数量、残留占位符和 JavaScript 语法。该根因有生成产物证据；先前的模块加载策略猜测未得到证实。

0.1.4 构建及直接 MCP 集成通过；已通过普通浏览器真实加载验证：显示 Workspace 列表、四个 Kanban 列；切换到另一个项目并切回时读取时间更新。截图 `browser-v014.png` 明确标记普通浏览器预览，不作为宿主握手通过证据。已重新安装 0.1.4，桌面 MCP Apps 内的数据桥接仍待复测。

### 0.1.5：SSH 项目清单及自动刷新

用户 0.1.4 截图已确认宿主握手及本机项目数据加载成功，反馈 SSH 项目缺失并要求自动刷新。

本机 `project/list` 仅返回本机 2 个项目。宿主 `list_projects` 工具能列出 3 个 SSH 项目，但该聊天工具不是插件自身的直接调用 API。因此探针增加隔离的只读兼容适配器：每次请求读取当前 `CODEX_HOME` 下 `.codex-global-state.json` 的 `remote-projects`，仅提取项目 ID、名称、路径和所属主机；与本机 App Server 项目合并。此内部持久化格式不是稳定公开接口，文件不可读时显示清单不可用提示。不会复制凭据或修改宿主状态，也不启动 SSH 连接。正式产品需再确定稳定的宿主清单桥接方案。[SSH 宿主与 App Server 的官方说明](https://learn.chatgpt.com/docs/remote-connections)

Workspace 键包含远程主机与项目 ID，防止跨主机同名项目混合；远程任务区不显示当前本机探针运行。远程项目存在于已保存清单不代表连接成功，连接状态为未知。

前端每 10 秒刷新，隐藏暂停，重新可见触发刷新。刷新串行处理；切换期间旧响应不覆盖新选择；列表无变化时不重建选项；失败保留最近数据与成功同步时间。当前选择被移除时显示不可用，不默默切换 Workspace。

验证：目录适配器的主机隔离、去重和损坏记录测试通过；直接 MCP 实测 2 个本机 + 3 个远程项目，远程选择隔离检查通过；普通浏览器选择 Lyria 后，同步时间自动从 21:01:14 更新到 21:01:18，选择保持不变。截图 `browser-v015.png`。新版宿主内自动刷新及远程清单仍需用户复测，未声明远程执行能力完成。

## 尚未完成

- 新版宿主内 SSH 清单、Workspace 切换与自动刷新复测；0.1.4 的握手与本机数据加载已由用户截图确认。
- 会话右侧 thread 入口呈现。
- 两条隔离执行会话的并行与事件关联已通过；原生 subagent 和 SSH 执行尚未验证。
- 主动中断后重启、同会话历史恢复已通过；突然断线、进程强杀和原生聊天实时观察尚未验证。
- 方案及版本评审的确定性门槛已通过自动测试；真实用户身份和评审交互尚未接入。

结论：本地插件侧栏接入可行，完整 agent team 运行闭环仍未验证。尚不能宣称阶段 0 全部完成或产品已实现。

## 复现与检查

```powershell
npm --prefix plugins/agent-team-probe ci
npm --prefix plugins/agent-team-probe run build
node plugins/agent-team-probe/verify.mjs
node --test plugins/agent-team-probe/workspace-registry.test.mjs
codex plugin add agent-team-probe@agent-team-local --json
python scripts/research/probe_plugin.py
npm run design:lint
```

`.mcp.json` 中的 Node 和源代码路径是当前机器的绝对路径。此安装方式用于验证，不是可移植产品分发方案。直接 MCP 检查不启动模型执行、不接管既有聊天。
