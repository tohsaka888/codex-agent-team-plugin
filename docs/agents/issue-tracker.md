# 本地规格与工单

初版源码使用 GitHub 仓库 `tohsaka888/codex-agent-team-plugin`；工程规格与任务依赖继续使用项目内 Markdown，未迁移为外部 Issues，也不是产品运行数据库。

- 规格：`.scratch/<feature>/spec.md`。
- 一工单一文件：`.scratch/<feature>/issues/<NN>-<slug>.md`。
- 工单包含目标、验收条件、Blocked by、Status、证据和 Comments。
- Matt 技能中的“发布到 issue tracker”表示保存本地文件；不自动向外部平台发布。
- 规格和工单确认遵循实际使用技能的步骤；草稿不标记为已批准或 ready-for-agent。
- `wayfinder` 的探索结果按其 map / issues / Answer 约定保存；不是工程交付完成。
- 接入外部 tracker 时先更新此约定，外部 PR 不是当前自动任务入口。

第一阶段特性标识为 `native-agent-team`。推荐切片在 `docs/phase1.md`；确认后才发布正式工单。
分类、工单生命周期和原生执行状态分别记录。安装技能或写入工单不自动触发全部团队流程。
