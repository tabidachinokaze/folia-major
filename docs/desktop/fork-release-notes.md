# Folia {{VERSION}} · 房间红心联动

**推荐配套：Folia 0.7.20 + Music Party 插件 0.3.16。** 请先更新宿主，再安装并重新启用新版插件。

- 跟随多人房间播放时，点击当前歌曲的红心，在个人收藏成功后同步发送官方房间红心动态。播放器、侧栏和独立遥控窗口使用相同逻辑。
- 取消收藏、试听及普通播放保持个人收藏行为；切歌或换房后，不把迟到的收藏结果发往新的歌曲条目。房间动态同步失败不会停止播放或撤销个人收藏。
- 修复网易云收藏接口返回业务失败时仍被当作成功的问题，避免错误点亮心形或触发房间动态。

[下载 Music Party 0.3.16](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.3.16)。插件同时修复空聊天撑高面板、表情库垂直边距与图片收藏菜单位置，并支持收藏自己发送的聊天图片。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游迁移需安装本 fork 的安装包。后续更新从本仓库 Releases 获取；插件 ZIP 单独更新。
