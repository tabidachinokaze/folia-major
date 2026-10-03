# Folia {{VERSION}} · 一起听试听与遥控

**推荐配套：Folia 0.7.18 + Music Party 插件 0.3.12。** 更新宿主后安装并重新启用新版插件。

- 一起听时，“播放”只在本机试听，“加入队列”才向房间推歌。试听不改变房间队列，结束或主动返回后对齐最新房间进度。
- 私信歌曲卡片在房间内提供“试听 / 推歌”选择，房间外直接播放；取消选择不执行操作。
- 修复真实网易云专辑卡片提示暂时无法打开的问题。专辑在原生页面展示，返回会话时保持音乐播放状态。
- 遥控窗口新增独立的房间点赞和返回房间按钮，下一首跟随房间状态。房间赞可连续点击，红心仍用于收藏；试听时可以调整进度。
- “继续一起听”卡片可直接退出检测到的房间，无需先恢复播放接管，本机普通播放保持不变。

[下载 Music Party 0.3.12](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.3.12)。以上新功能与专辑修复请使用本版宿主。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游迁移需安装本 fork 的安装包。后续更新从本仓库 Releases 获取；插件 ZIP 单独更新。
