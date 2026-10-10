# Matt Pocock skills 安装记录

2026-10-01 安装，来源：[mattpocock/skills](https://github.com/mattpocock/skills)。
固定提交：`d81f3a183412e71a5b1e84ca21bc1a35eea03a60`。
MIT 许可原文保存在 `mattpocock-LICENSE`；安装路径、文件校验摘要见 `skills-lock.json`。

## 安装范围

使用系统 `skill-installer` 的 `install-skill-from-github.py`，将 engineering、productivity、misc 共 31 个技能及其附属资源安装到项目级 `.agents/skills/`。
排除上游 `skills/in-progress/` 中的 6 个开发中技能；如需要可单独评估后补装。
不改变用户其他项目的全局技能；没有自动启动任何技能工作流、外部 issue 发布或 Git hooks。
文件已安装；协调者与派生角色的发现、正文读取和实际流程执行需分别验证，不能仅凭目录存在认定装载成功。

## 已安装

| 分组 | 技能 |
| --- | --- |
| Engineering（20） | ask-matt、code-review、codebase-design、diagnosing-bugs、domain-modeling、grill-with-docs、implement-spec、implement、improve-codebase-architecture、pr、prototype、research、retro、setup-matt-pocock-skills、tdd、to-spec、to-tickets、triage、wayfinder、wizard |
| Productivity（7） | grill-me、grilling、handoff、teach、to-questionnaire、wait-what、writing-for-agents |
| Misc（4） | git-guardrails-claude-code、migrate-to-shoehorn、scaffold-exercises、setup-pre-commit |

## 安装入口

插件新增 [setup-agent-team](../../plugins/agent-team/skills/setup-agent-team/SKILL.md)，显式调用时按固定来源安装缺失的项目级依赖；不覆盖已有目录，不默认全量安装，不修改全局登录。日常团队对话不再读取完整环境清单，按实际任务读取所需技能。安装与会话发现、实际运行分别记录。

## 使用约定

团队分派、成员回报和交付核对遵循[逐执行技能证据](../../plugins/agent-team/skills/team-sync/references/skill-evidence.md)，将实际读取和应用分别关联到对应 run；父卡汇总不能代替每次执行的记录。

按任务选择技能，不同时叠加所有流程。需求规格优先 to-spec / grill-with-docs；任务拆分 to-tickets；行为实现 tdd；难复现缺陷 diagnosing-bugs；领域和模块设计 domain-modeling / codebase-design。
用户主动调用技能保留上游 `disable-model-invocation` 标记；不能把安装理解为用户已经调用。Claude 专属、Bash 专属或外部 CLI 依赖的技能仍需按环境判断，不宣称全部流程已验证可在 Windows Codex 中运行。

`docs/agents/*.md` 是依据当前仓库情况编写的本地默认约定，不是已执行上游交互式 setup 的结果。当前没有远程仓库，采用本地工单、上游分类名、单领域上下文；以后可按用户要求修改。
上游技能原文保持未修改。适配规则放在 `AGENTS.md` 与本目录，更新时审查上游 diff，更新固定 commit 和摘要，禁止无记录地自动跟随 main。

## 复现安装

从锁文件读取路径和提交，安装到不存在的目标目录；脚本遇到已有技能目录会停止，不能直接覆盖用户改动。

```powershell
$skillLock = Get-Content docs/agents/skills-lock.json -Raw | ConvertFrom-Json
$sourcePaths = @($skillLock.skills | ForEach-Object { $_.sourcePath })
python "$env:USERPROFILE/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" `
  --repo mattpocock/skills --ref $skillLock.commit `
  --dest .agents/skills --path $sourcePaths
```

## 当前推进路线

项目自有入口 `native-agent-team` 位于 `.agents/skills/native-agent-team/`，与固定来源的31个 Matt 技能分别维护。它通过原生对话组织团队，使用合同见 [native-team.md](../native-team.md)；不会自动调用其他用户专属技能。

第一阶段见 [本机原生团队计划](../phase1.md)。本轮使用 writing-for-agents 与 domain-modeling 整理文档，并按 to-spec 形成已确认验收入口的规格。后续依次为 to-tickets 切片确认、适用的实现/TDD、独立审查与修正复查；尚未执行完整实现工作流。

角色只按任务读取所需技能与引用，不预加载全部正文。保留用户主动调用标记，遵守原生配置继承和权限策略；不通过插件另起模型执行器。完整上游工作流依赖和 Git 基线以实际环境为准。
