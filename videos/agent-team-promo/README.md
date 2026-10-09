# Codex Agent Team 宣传视频

[返回项目介绍](../../README.md)

45 秒中文静音动效，1920 × 1080，30 fps。主张：让原生 Agent 成为可追踪、可协作、可验收的工程团队。

- [完整 MP4](renders/agent-team-promo.mp4)
- [15 秒 GIF 节选](renders/preview.gif)
- [封面](renders/poster.png)
- [五镜头总览](renders/contact-sheet.png)
- [制作 brief](BRIEF.md) · [分镜](STORYBOARD.md) · [设计规范](frame.md)

## 镜头

| 镜头 | 时间 | 内容 |
| --- | --- | --- |
| 01 | 0–9 秒 | 从一句需求，到团队共同目标和证据交付 |
| 02 | 9–18 秒 | 协调者与按需角色、Skills |
| 03 | 18–27 秒 | Kanban、Org Chart、详情的只读追踪价值 |
| 04 | 27–36 秒 | 具体 AC、自验证、独立审查与适用的人工核验 |
| 05 | 36–45 秒 | `$setup-agent-team` 准备工程，`@Agent Team` 日常启用 |

角色图和看板是文字图形化的功能示意，明确标为演示数据，不是产品截图。功能依据来自仓库 README、架构、展示合同和验收合同；不包含未经验证的效率指标或客户端兼容承诺。宣传视频不改变正式产品 UI 的视觉基线。

## 继续编辑

使用 Node.js 24；编码需要 FFmpeg 和 FFprobe 在当前进程 PATH 可用。HyperFrames 固定为 `0.8.143`，GSAP 固定为 `3.14.2`。初次运行 npx 与编译 CDN 脚本需要联网。

```powershell
cd videos/agent-team-promo
npm run dev
npm run check
npm run render -- --quality delivery --output renders/agent-team-promo.mp4
```

`index.html` 是组装后的入口；每个镜头在 `compositions/frames/`。直接编辑镜头可以只重渲染，也可修改 `build-scenes.mjs` 后运行 `node build-scenes.mjs` 重新生成五个镜头（会覆盖这些生成的镜头文件）。组装工具属于安装的 product-launch-video Skill，恢复该工具后执行：

```powershell
node <product-launch-video技能目录>/scripts/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes .
```

静音是本次制作选择：画面文字承载完整信息，无语音、音乐或音效。README 使用 GIF 图片链接 MP4，不依赖 Markdown 平台的内联视频标签。仓库未上传或发布到外部服务。

## 验证与素材来源

HyperFrames 浏览器检查通过：15 个时间采样，lint/运行时/布局零错误、零警告；对比度检查 61/61。自动运动断言未启用；另行人工查看镜头和切换采样，并核对导出 MP4 的总览。完整结果见 [check-result.json](check-result.json)。

字体为 Google Fonts 官方仓库的 [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)，按本次画面文字裁剪为 WOFF2，许可见 [OFL](assets/OFL-NotoSansSC.txt)。修改文案新增字符时应重新生成字体子集或使用包含新字符的完整字体。

本机 FFmpeg/FFprobe 和字体裁剪工具仅放在工作区忽略目录 `.runtime/`，没有更改全局 PATH 或项目根依赖。预览、检查截图等可重建产物由本目录 `.gitignore` 排除；发布用 MP4、GIF、封面和总览保留。
