# 安装与接入

[返回 README](../README.md) · [可移植追踪合同](portable-tracking.md)

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

预设包括 Coordinator、Requirements、Architect、Developer、Reviewer、UE。Codex实际发现/派生能力以当前会话工具为准，Profile不匹配时仍可使用动态职责。项目 Skills 与插件 Skills 两种安装方式择一；有重复或旧副本时核对宿主实际选中的版本。工程流程需要的 Matt Skills 单独核验，来源、许可及安装边界见 [Skills说明](agents/skills.md)。

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

## 独立网页默认入口（2026-10-09）

`node <插件绝对路径>/build.mjs --web-only` 构建 `dist/web`；将整个目录复制到任意机器/目标工程，仅需 Node.js 20+。运行 `node <独立包>/open-web.mjs --workspace <目标工程> --team-id <同步team-id> [--data-dir <同步目录>]`。启动器仅连接127.0.0.1，检查服务健康身份及 workspace/data-dir 后打开系统浏览器，返回可复制 URL；`--no-open` 不打开浏览器，冲突用 `--port`。安装Skills时安装器将独立包复制到 agent-team/web，已有目录保留；旧版本需由用户核对后迁移，不自动覆盖。Codex MCP server.mjs保留兼容，默认流程不调用。宿主执行记录 execution:// 在独立模式明确不可用；工作区内已关联文件仍可预览。


## 远程 SSH 看板访问

远程执行启动器时使用 --no-open，服务只监听远程回环地址。通过宿主已有端口转发，或在用户本机执行 ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:<本机端口>:127.0.0.1:<远程端口> <已配置SSH别名>，再从本机浏览器打开转发地址并带正确 teamId。转发依赖 SSH 进程存活；已有监听须核对健康接口的 workspace/data-dir 后复用。启动器 service=ready 表示服务可用，browser.status=requested 只表示系统接受请求；skipped/unavailable/failed不表示页面打开。完整步骤与回报要求见 [Agent Team Skill](../plugins/agent-team/skills/agent-team/SKILL.md)。
