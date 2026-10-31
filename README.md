# dsh-video-storyboard (DSHA 主权增强分支)

> **定位**: 本仓库是 [`SAOS-3624/dsh-video-storyboard`](https://github.com/SAOS-3624/dsh-video-storyboard) 的 DSHA 主权 Fork 分支（当前版本：`v0.5.4`）。专注于让大语言模型以**极低 Token 成本（384 tokens 封顶）**与时间码对齐方式完整理解视频内容。

---

## 🌟 主权魔改与核心特性

1. **接触表分镜技术 (Contact Sheet Storyboard)**：
   - 彻底摆脱传统逐帧倾倒多模态单图的 Token 浪费，将视频浓缩为一张带时间码的高清宫格图；
   - 辅以时间对齐的文本清单（台词 + 时间起止），支持 `video_zoom` 进行局部高密放大。
2. **5 大专用多模态工具**：
   - `video_probe`：轻量探活，零图片 Token 获取视频时长、分辨率与音轨；
   - `video_storyboard`：生成主体宫格分镜与时间文本清单；
   - `video_zoom`：局部时间窗精细缩放深入检视；
   - `video_locate`：按台词或文字秒级定位时间码；
   - `video_subtitles`：无音轨/艺术字场景下的硬字幕拼图提取。
3. **关键修复与稳定性加固**：
   - **台词链路修复**：合入 PR #41 与 PR #43，彻底修复两处台词静默失效漏洞；
   - **路径与端口对齐**：合入 PR #42 服务端口径与硬字幕桥接路径回溯修复；
   - **质量保障**：492 项单元测试全部通过。

---

## 🛠️ 安装与使用

### PC 端打包并推送到手机端
```bash
uv run python scripts/deploy_to_phone.py --plugin video-storyboard
```

### 手机容器端一键安装
```bash
sh /sdcard/dshproject/updates/install_or_update.sh
```

---

## 🙏 致谢与声明 (Acknowledgments)

- 衷心感谢原作者团队 [`SAOS-3624/dsh-video-storyboard`](https://github.com/SAOS-3624/dsh-video-storyboard) 的原创架构与优雅实现。
- 本项目依据 Apache-2.0 许可证进行自主托管与衍生维护。
