# 三项能力验证结论

> 范围说明：本文保留当时的实测证据与接口参考，不是当前实施规格。当前采用 Codex 原生团队执行、插件 UI 完全只读；第一阶段先完成本机角色预设与 Skills 协作闭环，见 [当前架构](../architecture.md) 和 [阶段一计划](../phase1.md)。旧控制型方案、独立执行器、审批门槛与后台常驻的结论不作为当前方案的实施前提，也不再重复扩展其 POC。

本文是前一轮记录；最新一次性端到端收口及“能否做”的决定依据为 `final-feasibility.md`。

日期：2026-10-01。探针版本：0.1.6。本轮用户授权统一验证真实并行与追踪、中断恢复、人工评审门槛。

| 环节 | 结果 | 证据与边界 |
| --- | --- | --- |
| 真实并行执行和事件关联 | 通过本机执行验证 | 两个独立 App Server 会话均完成只读终端任务，输出与各自隔离文件相符；turn 和 commandExecution 均有重叠；事件携带 taskId/threadId/turnId/itemId。见 `runtime-probe.json`。不是原生子 agent 派生树验证。 |
| Kanban、Org Chart、详情 | 通过普通浏览器数据呈现验证 | Kanban 有两个真实执行完成卡；Org Chart 对应两个真实会话和任务；点击卡片显示中断及恢复事件。见 `execution-v016.png`。0.1.6 宿主内呈现未重新人工验收。 |
| 中断与恢复 | 通过所测本机路径 | 执行睡眠命令时调用 turn/interrupt，收到 interrupted；关闭测试 App Server，状态显式标记未知；重启后通过 thread/resume 恢复相同持久会话，再执行一轮无工具的历史回忆任务，返回正确随机原文且无命令重执行。 |
| 人工评审门槛 | 确定性规则测试通过；真人交互未验证 | 未批准不能 dispatch；执行结束不能直接验收；退回阻止实施；方案/交付版本变化使批准失效；重复同请求幂等、冲突请求拒绝；批准记录重新加载后保留。见 `review-gate-probe.json`。提交人为 TEST_FIXTURE_NOT_REAL_USER，不是用户批准。 |

## 限制与后续范围

- 中断验证针对主动中断后重启恢复，不证明突然断网、强杀进程时仍在运行的命令可无损续跑。没有检查关闭桌面 App 后后台独立运行或 SSH 上的执行恢复。
- 恢复检查没有重复执行命令，但不是完整外部副作用的 exactly-once 保证；持久调度、租约和事务仍待产品实现。
- UI 根据真实探针事件刷新，服务拥有的独立会话可追踪；未接管已有原生聊天的实时执行，也未验证原生 subagent 关系。
- 评审规则仅为最小规则原型，未接入宿主用户身份、审批 UI、MCP 写操作、并发事务或实际模型任务调度。不能以测试夹具的批准声称人工闭环完成。
- 本轮创建了两个批次的小型验证会话。每批一个持久会话用于恢复、一个临时会话；未修改或归档用户已有聊天。所有模型选择继承本机默认配置。

## 首轮失败与修复

首轮两个任务及恢复均执行成功，但提示中的“校验码”被执行者 A 理解为 SHA-256，因此与原文断言不符。原记录保留于 `runtime-probe-first-attempt.json`。第二轮明确要求原始 PROBE_ 文字、禁止哈希后，8 项执行检查全部通过。未修改验收断言迎合错误输出。

## 复现

```powershell
python scripts/research/runtime_probe.py
node --test plugins/agent-team-probe/review-gate.test.mjs
node --test plugins/agent-team-probe/workspace-registry.test.mjs
node plugins/agent-team-probe/verify.mjs
python scripts/research/probe_plugin.py
```

runtime_probe 会真实启动小型模型任务并写入 `.runtime/probe/execution.json` 供看板展示；其他列出的检查不会启动模型任务。工具直接调用验证与浏览器渲染验证仍是分段证据，不冒充插件写工具启动模型的完整链路。

结论：本机执行层的并行、事件、中断和历史恢复能力已获得实测证据；人工门槛的规则原型已通过自动测试。可以据此进入详细规划，完整真人评审和异常恢复验收应列为最小闭环阶段交付，不能把本 POC 描述为已可用的完整团队产品。
