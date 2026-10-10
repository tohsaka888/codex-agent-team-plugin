# 逐执行技能证据

协调者分派、成员读取或应用 Skill、Reviewer 审查及协调者交付时执行本流程。沿用现有 `skill`、`activity`、`artifact` 和 `read` 操作；这是已有回报责任的核对步骤，不新增同步字段或全局验收门槛。

## 分派

1. 按当前阶段列出必要 Skill 的实际路径与预期应用范围。新规格用 to-spec、拆分用 to-tickets、实施按 implement-spec 的适用流程、行为修改用 tdd、难复现缺陷用 diagnosing-bugs、审查用 code-review 的适用范围。只选择本次执行需要的技能，保留用户主动调用边界。
2. 委派提供 workspace、data-dir、team-id、task-id、run-id、同步脚本路径，并要求成员在读取后回报、应用后更新、结束前查询核对。主 Agent 自己实施或复核时同样使用自己的独立 run。
3. 技能清单放在委派正文或关联的任务文件；注明每项是要求读取还是要求应用、所需产物及不适用依据。需要特定方法才能满足既有 AC 时，在该条件的验证说明中明确对应证据；改变已确认 AC 的实质范围时按项目评审规则处理。

委派可使用以下片段，并把占位符替换为实际值：

```text
追踪：workspace=<工程>；data-dir=<目录>；team-id=<团队>；task-id=<工单>；run-id=<本次执行>
同步：Skill=<team-sync/SKILL.md绝对路径>；脚本=<scripts/sync.mjs绝对路径>
必要技能：<Skill实际路径>；预期应用=<本次方法与产物范围>
读取后用 skill 回报 read；实际应用后更新 applied 并引用当前证据。
结束前 read 核对本 run.skills，逐项说明已读取、已应用、不可用或不适用依据。
```

## 成员回报

1. 成功读取正文后立即回报 `status=read`，evidence 保存可核对的命令/工具结果引用和读取范围，包括是否只读部分正文。目录存在、技能元数据、角色预设或父会话读取不代替本次记录。
2. 实际执行方法后用同一 run-id、skill-id 更新 `status=applied`，evidence 指向当前产物、命令及验证结果，说明应用范围与适配限制。读取文件或测试通过本身不证明完整 Skill 流程已执行。
3. 确认依赖不可用时用 `status=unavailable` 保存实际错误。无需使用的技能在任务说明或 activity 中记录不适用依据；不以 unavailable 表示正常跳过。
4. 在当前工具回合回报读取/应用，里程碑批次后用 `read` 一次核对涉及 run 的 skills；无需每条技能额外发起模型回合。失败时有界重试并报告原因；正常结果回复列出必要技能逐项状态及缺口。长 evidence 用 JSON body-file。

示例中的团队、工单和执行必须事先登记；先用 `--help` 核对所用脚本版本：

```text
node <同步脚本> skill --workspace <工程> --data-dir <同步目录> --team-id <团队> --task-id <工单> --run-id <执行> --skill-id tdd --name tdd --reference <tdd/SKILL.md实际路径> --status read --evidence <真实读取结果引用与范围>
node <同步脚本> skill --workspace <工程> --data-dir <同步目录> --team-id <团队> --task-id <工单> --run-id <执行> --skill-id tdd --name tdd --reference <tdd/SKILL.md实际路径> --status applied --evidence <实际red-green命令结果和当前切片产物>
node <同步脚本> read --workspace <工程> --data-dir <同步目录>
```

## 审查与交付核对

Reviewer 对照委派清单、成员报告及 `read` 返回的每个 run.skills，逐项核对名称、路径、状态、证据与应用范围。发现实际读取但未回报，交给执行者或协调者依据真实结果补录；发现只有读取证据却标 applied，按实际范围纠正并记录问题。审查者也回报自己的技能证据。

协调者在收集结果、进入全流程复核及汇总交付时，核对每次执行的清单，不能仅检查父卡或团队总数。读取、已报告应用、不可用及不适用分别汇总；缺少依据保持“未回报/待核对”，不得声明 Matt 流程完整执行。缺口影响既有 AC 时该项保持未通过；只有追踪漏报时如实列出，不改写原生执行已结束的事实。

父卡汇总所属执行的技能记录，执行卡只显示本 run 的证据。看板不会自动解析任意 cat/sed 调用；父会话或另一 run 的记录不自动传给当前执行，同一成员续派仍逐 run 回报。不同卡记录相同 Skill 不代表重复工作，也不代表可以共享通过状态。

## 恢复与历史补录

恢复时先读取已有归档和真实工具结果，按原 task/run 关联补录，并注明协调者代录、原发生时间及当前核对范围。找不到历史依据时保持缺失；现在重新读取只能证明当前读取，应绑定实际当前执行。安装更新和文档检查不证明正在运行的会话已重读，交付需说明生效范围。
