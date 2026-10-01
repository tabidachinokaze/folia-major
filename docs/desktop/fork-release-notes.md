# Folia {{VERSION}} · Music Party 连续播放

**配套升级：Folia 0.7.13 + Music Party 插件 0.3.5。** 请先升级 Folia，再安装并重新启用插件。

- 退出多人房间或重新匹配时保留当前歌曲、进度及播放/暂停状态，控制权交回原生播放器。当前歌曲不在原个人队列时加入队首。
- 配套插件的匹配等待期间继续普通播放，接收官方匹配确认和失败通知，支持取消与独立超时。
- 配套插件的聊天每次打开定位最新消息，向上滚动加载历史，推荐和点赞等动态使用较弱的文字样式。
- 配套插件的操作提示改为宿主 toast，不再常驻面板。

[下载 Music Party 0.3.5](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.3.5)。匹配通知协议与模拟入房流程已验证，真实账号的完整匹配仍需跨端验收。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游迁移需安装本 fork 的安装包。后续更新从本仓库 Releases 获取；插件 ZIP 单独更新。
