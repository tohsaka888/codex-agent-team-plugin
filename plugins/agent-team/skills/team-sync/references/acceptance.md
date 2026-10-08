# 每张卡的强制验收合同

所有父工单、独立执行、只读分析、协调和审查任务都必须有非空 AC。先登记合同再派生；不能先建空卡，不能默认复制父卡全部条件或通过状态。旧缺失卡先补齐当前合同，禁止补造历史验证/人工确认。

创建 task/run 原子提供 role、taskType（code/design/documentation/analysis）、version（AC 版本）和 acceptanceItems。每项有 id、具体 label、method、verifier（agent/human）、kind（check/unit_test/prototype/delivery）。id 稳定且唯一。每卡至少一项 Agent 可验证条件。只有需要人工核验的功能才添加 human 项；纯分析、审查、自动回归可完整验证的执行不添加通用人工确认项。人工项必须有 manualCheck：entry（具体 App/页面/文件入口）、steps（操作步骤数组）、expected（可观察预期结果）。人工核验需求由功能、角色规则和用户要求决定，不能删除确需核验的项规避验收。动态职责同样适用。

Developer 编码/缺陷修复明确 taskType=code，必须有 unit_test 条件，实际测试文件、命令和结果进入 evidence；构建/lint 不替代单元测试。纯文档/配置工作记录分类依据，核对引用/合法性；禁止改类别规避编码验收。UE 必须有 human prototype 项，用户明确确认匹配范围的具体原型版本后才能放行依赖开发；设计规范校验、图/UX/design.md 一致性另列 Agent 条件。

Requirements 核对边界、故事、AC 与依赖；Architect 核对方案取舍及适用 ADR；Reviewer 核对当前 AC、真实产物/测试和修正复查；Coordinator 核对汇总及依赖。每角色还需任务具体业务条件；人工只核验无法由 Agent 证据代替的具体功能或设计决策。

Web/App 界面实现、视觉/交互修改或 UI 修复须按 [UI Check](../../team-review/references/ui-check.md) 在工单与相关执行卡登记具体 Agent check AC。method 明确页面/状态/设备范围、实际运行截图与用户确认 UI 图的逐对比对、design.md/ux.md 核对和交互验证；evidence 引用当前报告、图片对、差异及复查结论。缺少基线、真实截图或必需覆盖时保持未通过。此规则由 Agent 执行，现有脚本只检查合同与证据绑定，不自动判断图像一致性。

## 公开同步示例

通过 --body-file 提交 JSON，或 --acceptance-items 传 JSON 数组；正常回复保持自然语言。task/run 的合同示例（执行另填 runId/provider/title/真实身份）：

```json
{
  "teamId": "app", "taskId": "01", "title": "拒绝空 AC 的编码实现",
  "role": "Developer", "taskType": "code", "version": "ac-v1",
  "acceptanceItems": [
    {"id":"tests","label":"空 AC、跨卡和旧版证据的单元回归实际通过","method":"node --test；记录测试文件、命令和结果","verifier":"agent","kind":"unit_test"},
    {"id":"delivery","label":"执行卡显示独立 AC 和当前验证证据","method":"查看真实页面并在原生对话回报核验结果","verifier":"human","kind":"delivery","manualCheck":{"entry":"Agent Team → Kanban","steps":["打开 Developer 执行卡详情","查看验收条件和验证证据"],"expected":"显示本执行的条件与版本；Agent 项附证据，人工项未确认前未勾选"}}
  ]
}
```

执行可用 parentItemId/parentVersion 明确引用父条件，仍有独立证据与适用人工核验；引用不是自动继承通过。已存在 AC 的状态/活动更新不必重复提交定义。目标、角色、类别或 AC 版本变化需原子重新提供完整合同，旧证据失效并保留历史。

1. 保存真实工作区产物，使用 artifact 关联到对应卡；传 run-id 表示执行卡，不传表示父工单。
2. 保存本卡结果说明（列出实际产物、验证与限制），执行 result --reference 文件 --version 结果版本 [--run-id]。脚本计算实际 SHA256，并绑定已关联产物；文件变化、增加产物或新结果版本使旧证据不再满足当前验收。
3. 每项 Agent AC 运行真实验证，使用 acceptance --item-id ID --status passed|failed --evidence 实测结果 --reported-by 姓名 --version AC版本 --digest 当前结果SHA256 [--run-id]。未运行保持 pending/unknown；failed 保持未通过。不能用 acceptance 更新人工项，也不能借新建定义注入 passed。
4. Agent 项全部通过且结果可核对后才能 task --status awaiting_review。独立 Agent Review 用 review --author-type agent --scope delivery --version 当前结果版本 --digest 当前结果SHA256，并保存署名、范围和依据；初审 rejected 保留，修正后重新核对当前版本并复查。
5. 仅对实际存在的 human delivery 项登记 review-requirement --item-id AC_ID --type delivery --reference 当前结果文件 --version 当前结果版本 [--run-id]。prototype 项使用 ui/visual 类型和实际原型文件；确认范围必须包含该卡需要的页面/状态，并用 affected-task-ids 列明允许依赖开发的工单。范围变更使旧确认失效；未列明的新工单不得开工。
6. 用户明确验收本卡具体结果后，协调者用 review --author-type human --reporter-role coordinator --quote 用户原话 --requirement-id 对象ID --version 对象版本 --digest 对象SHA256 [--run-id] 回报；同时提供 author/evidence/decision/scope。不从 Agent 评论、超时、执行结束或规格确认推断交付认可。身份为协调者事实声明，不声称身份认证。
7. 同一次用户回复可确认列明的多卡版本，协调者对每张卡分别记录。业务 task completed 只有当前全部 AC、Agent Review、适用人工功能核验满足，且关联执行均已结束并分别验收后才允许。run completed 仅记录执行结束，验收独立计算。

读 read 核对每卡 acceptance.items、agentReady、humanStatus、reviewReady、accepted；未人工验收保持 pending。恢复旧卡、返工、条件或结果变化后重新核对，不复用旧版确认。UI 只显示条件/证据/版本/欠缺项，不批准或修改任务。
