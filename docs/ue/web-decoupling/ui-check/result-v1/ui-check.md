# 协作时间线 UI Check result-v1

team web-decoupling-20261009；task03（ac-v2），run timeline-dev（ac-v1）及timeline-review。Coordinator /root 实际通过 cua Chrome extension操作与截图；Reviewer /root/web_backend_reviewer 独立打开批准图/实际图、审查代码及测试，浏览器操作记录由Coordinator提供，独立结论见 ../../../../../.scratch/web-decoupling/review-03.md。用户视觉决定仅为v1两图与UX，不代替交付验收。

基线为 [main](../../v1/main.png)、[states](../../v1/states.png)、[UX原文](../../v1/ux.md)、[决定](../../v1/decision.md)、[实施说明](../../v1/implementation.md)和根design.md。主图SHA256 4161330c3c13fd0403a51c75af03b45c119882e2cbe97d662e26b42ead486891；补充图SHA256 f04b029de67ffbaf1d854489c92d73b8b323813bcf52b60b4ebcda1f9da92362。

当前独立bundle SHA256 2849462f281c8ffd97a150c13d526442e29c6dcf17a27c8778e92d77dc218858；源码/规范指纹见development-03.md。实际Windows桌面Chrome extension、页面缩放未修改，按批准范围设置1536×1024及390×844视口，随后恢复默认视口。浏览器精确版本接口不可用，未补造版本。采图2026-10-09约14:03—14:09 Asia/Shanghai，逐张实际getScreenshot返回bytes保存，未用生成图替代。主题/减少动效/网络暂停均用受控CDP，结束已清除；减少动效观察data-decorative-motion=paused。

真实入口 http://127.0.0.1:43819/?transport=http&teamId=web-decoupling-20261009；异常夹具同一产品web-server和同一HTML，隔离临时workspace D:/Cache/15613/Temp/agent-team-timeline-ui-LiAWQC，端口51131，team timeline-demo/empty-demo，所有夹具正文/来源/团队标记演示数据。夹具身份demo-native-identity仅为演示，不是宿主真实身份。

| 状态 | 确认图 | 实际截图 | 环境 | 结果与依据 | SHA256 |
| --- | --- | --- | --- | --- | --- |
| desktop-light | [main.png](../../v1/main.png) | [timeline-desktop-light-final.png](timeline-desktop-light-final.png) | 1536×1024 浅色 | 通过：真实task03、回复详情；四色轴/左时间/两列字段修正通过 | a7a2b8a0aebd842c75b536ade0ae328c598ac8282b9b378a33eedf597f4cdc06 |
| desktop-dark | [states.png](../../v1/states.png) | [timeline-desktop-dark-final.png](timeline-desktop-dark-final.png) | 1536×1024 深色 | 通过：真实task03、回复详情；选中、边框、文字对比可读 | a1d1a2df616781fafc526fe1de5b1574d797f6ff6ec95a68dbc81a2ec2cca13f |
| empty | [states.png](../../v1/states.png) | [timeline-empty-final.png](timeline-empty-final.png) | 1536×1024 浅色 | 通过：独立演示empty-demo；无交互说明和数据范围可读 | 52e2697fcd25185e225426578723ed4c3851d08e43ddcc2cbffec790f5b5cb98 |
| narrow | [states.png](../../v1/states.png) | [timeline-narrow-final.png](timeline-narrow-final.png) | 390×844 浅色 | 通过：短导航、筛选换行、卡内时间、长正文四行折叠 | fa956a33fd27cadda2e198c49ac249296ab33a478141bfe985bb2d649473a9d5 |
| narrow-expanded | [states.png](../../v1/states.png) | [timeline-narrow-expanded-final.png](timeline-narrow-expanded-final.png) | 390×844 浅色 | 通过：长消息展开超过四行，HTML标签保持纯文本 | 4dd06802e0654f8ca3f44864f444f202241a0eb737b9853d8931ebb3af8fdf94 |
| narrow-unknown | [states.png](../../v1/states.png) | [timeline-narrow-unknown-final.png](timeline-narrow-unknown-final.png) | 390×844 浅色 | 通过：未知原消息/身份/任务详情抽屉及警告 | 28d9e81d6d7c7a1a492ac9cb7d26eaa9cea596235ee381887751d1eb716a8f59 |
| disconnected | [states.png](../../v1/states.png) | [timeline-disconnected-final.png](timeline-disconnected-final.png) | 390×844 浅色 | 通过：CDP离线后的最近快照、成功时间、重试 | e6cdbfe1f872d38ec10f5a92737708b26af6f6dd3cf4b915324cf94637d5524b |
| filter-empty | [states.png](../../v1/states.png) | [timeline-filter-empty-final.png](timeline-filter-empty-final.png) | 390×844 浅色 | 通过：事件分派筛选无结果，清除入口；区别空团队 | 39a38ec4a096f58e23d8b02fb9f0ebac6edcd5e755d1bcfbf34eb7fe4d7b6224 |
| loading | [states.png](../../v1/states.png) | [timeline-loading-final.png](timeline-loading-final.png) | 390×844 浅色 | 通过：仅暂停Fetch类交互请求；初次同步和真实骨架 | 944f676ba5179572a776d91c78416f540ded439370734e8f4a7876fc6ed40aa3 |
| first-error | [states.png](../../v1/states.png) | [timeline-first-error-final.png](timeline-first-error-final.png) | 390×844 浅色 | 通过：首次请求超时无成功快照，明确错误和重试，无加载骨架 | 2ede204180ca4e4aa25c2e6c43b5e23fadd71705dd055037390450ef63cff9f6 |
| medium-expanded | [states.png](../../v1/states.png) | [timeline-medium-expanded-final.png](timeline-medium-expanded-final.png) | 390×844 浅色 | 通过：不足160字中文实际溢出可展开，截图可见收起全文 | 2709cf3043ddac4677b749719b3cbf860b75b52b03eec57b52f1792e0117494f |

实际交互核对：任务03及事件reply组合筛选成功；原文被隐藏时按钮明确调整筛选，点击后选中原文并聚焦。sender筛选返回发出的message和接收的reply各一条，同名sender/receiver由runId区分。关联任务进入既有详情，返回时间线仍保留选择和筛选。Esc关闭当前抽屉后activeElement为BUTTON/查看回复详情。长消息展开/收起正常，script/b标签为文本，未出现对话框。

增量：detailTop520.5714px/selected=true在新status加入后不变，出现1条新交互按钮。迟到较早事件加入前firstVisible=demo-reply、offset=-116.419647px、scrollTop369.714294；加入后仍demo-reply、offset=-116.589294px、scrollTop538.285706，差异约0.17px为实际像素舍入，无跳读。查看新交互后迟到事件offset14px可见。晚补同team sender名字/演示native身份后，旧demo-message详情明确呈现更新身份；未知receiver仍未知。

断线保留最近快照，恢复重试后4条事件未重复；初次超时显示无成功快照而非加载骨架，恢复网络后自动补齐。未回报历史不推断完整宿主对话。来源为声明、timestamp为声明/观察回报、recordedAt归档时间，状态观察不改变验收。

修正复查：首版灰圆点、桌面时间位置、dt/dd错位；时区按字符串排序、身份晚补、筛选下定位隐含动作、Esc detached焦点、中长正文阈值、迟到阅读锚点、首次失败骨架均有界修正。当前图片按上表逐对核对布局、层级、样式、可读性、响应式、状态及交互。既有顶部/设计tokens保留，正文日期为真实或演示数据，不逐字复刻生成图；补充图2024示例误差不进入实现。

旧initial截图及不符名称的desktop-light/empty/narrow-expanded早期截图仅保留排查历史，不作为通过证据。只采纳上表-final图片。无真实移动设备实测，本轮390px为桌面浏览器视口；覆盖批准范围，未声称所有宿主客户端完整适配。
