# 只读团队画布与动效调研

日期：2026-10-02。由原生 requirements 子 Agent 联网研究，architect 子 Agent 分析现有代码与几何，root 统一保存。以下是候选方案；没有宣称正式插件已完成升级或测得 60fps。

## 一手参考与采用方式

| 来源 | 借鉴内容 | 本项目候选 |
| --- | --- | --- |
| [Linear 设计更新](https://linear.app/now/behind-the-latest-design-refresh) | 让重要内容保持焦点，弱化辅助导航与多余边框 | 中性画布、轻网格，选中角色和关系突出 |
| [React Flow viewport](https://reactflow.dev/learn/concepts/the-viewport) | 设计工具式平移和缩放 | 拖空白、滚轮平移、Ctrl/⌘ 滚轮缩放、适配全图 |
| [React Flow 连线动效](https://reactflow.dev/examples/edges/animating-edges) | SVG 路径与沿路径动画 | 已核对关系的短飞线，节点和连线共享变换 |
| [Fluent 2 motion](https://fluent2.microsoft.design/motion) | 动效解释变化，编排引导注意，考虑运动距离 | 先避让画布、再开详情；卡片跨列保持视觉连续 |
| [web.dev 动画性能](https://web.dev/articles/animations-guide) | 优先 transform 和 opacity | 画布整体变换、卡片 FLIP；避免持续布局重算 |
| [MDN 减少动效](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | 跟随用户减少动效偏好 | 即时避让、静态关系和即时状态更新 |

React Flow 是可借鉴范式，现有应用使用原生 DOM，没有据此决定引入 React。没有登录并亲测 Linear/Figma 产品，资料阅读不能当作竞品交互实测。

## 关系与动作语义

关系线只来自已核对的父子标识，未知关系与循环保持独立展示。选中高亮父子节点和祖先路径；非关联节点轻度降低视觉强度。飞线表示“聚焦关联”，不能冒充已采集的消息、token 流量或当前正在通信。候选飞线只短时播放，建议同时动态边上限 8，提供暂停并跟随减少动效。

时间建议：微反馈 100–140ms；高亮 160–200ms；画布避让 220–280ms；详情 160–200ms；卡片迁移 320–420ms。具体参数来自本项目设计取舍，不是上述来源的统一规定。

## 详情避让公式

坐标统一为画布内坐标，世界节点矩形 N=(x,y,w,h)，视口 T=(tx,ty,s)，详情展开后的安全矩形 R=(rx,ry,rw,rh)，已扣除面板、间隔和边距。

```text
s'  = min(max(s, 1), rw/w, rh/h)
tx' = clamp(tx, rx - s'×x, rx+rw - s'×(x+w))
ty' = clamp(ty, ry - s'×y, ry+rh - s'×(y+h))
```

正式方案选中时恢复至少 100% 阅读比例，只做最小必要平移；当前比例更大时可有限缩小。如果 s' 小于 1，直接使用独立详情。画布宽度不足 820px 时使用底部面板，否则右侧面板；布局按画布内容尺寸决定。极小容器无法同时容纳角色与详情时不硬夹到最小缩放后宣称完整可见。
计算使用画布内容盒，避免把边框外框与节点世界坐标混用；窗口变化后重新检查完整包含关系。

快速选择通过 intentVersion 取消旧动画及旧展开回调，从当前 computed transform 继续。手动拖动、切换会话、关闭详情与节点消失都取消旧意图。关闭详情保留当前视口。自动刷新保持该 Session 的视口。

## Kanban 真实变化

稳定 Task ID 对比同会话前后快照，真实状态变化才触发迁移；queued→completed 直接到最新列，不演出未知的 running/review。首次载入、重复快照、筛选和会话切换不表述为状态流转。
前后卡片都在可见区域时采用 FLIP，语义状态立即更新，动画仅解释位置变化。快速新快照替换旧动画，不排队播过时状态。页面隐藏与减少动效时立即更新，无连续运动。

## 本轮产物与限制

已确认规格：[spec](../../.scratch/ui-motion/spec.md)，切片：[确认记录](../../.scratch/ui-motion/tickets-draft.md)，交互候选：[原型](../../.scratch/ui-motion/motion-prototype.html)。原型全部为演示数据，没有事件写入、原生任务操作或远程执行。正式实现、浏览器与安装插件核对见 [交付记录](../../.scratch/ui-motion/delivery.md)。
架构 Agent 执行了四组无文件算术检查，确认右侧、已可见、左上越界、超大矩形的包含关系。正式浏览器检查、独立审查和极小容器回退的最终结果另外记录；资料调研不是正式插件验收。

用户已确认：本轮仅拖动画布，节点布局固定；不实现节点位置拖动。资料中的节点拖动范式只作为被排除方案记录。
