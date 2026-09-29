# Folia {{VERSION}} · Music Party

**配套升级：Folia 0.7.11 + Music Party 插件 0.3.0。** 请先升级 Folia，再安装并重新启用新版插件。旧版插件 0.2.0 使用上一版播放接口，需要同时更新。

- 多人房间队列直接接入原生播放列表、队列搜索与拼贴，移除插件内重复的待播页面。
- 同步按钮替代打乱；待播歌曲支持置顶、删除本人推荐，隐藏本地“下一首播放/移到队尾”操作。同一首歌的不同推荐条目独立处理。
- 只有当前播放歌曲显示房间点赞，可连续多次点赞；切歌或退出后，不会把尚未发送的旧点赞转到新歌曲。
- 私信迁入首页顶部胶囊，支持会话、历史、已读、表情和官方邀请。输入消息时不会误触播放快捷键。
- 播放栏、拼贴、下一首命令及快捷键统一请求官方房间切歌，不再受个人队列长度影响。
- 退出房间或停用插件后恢复个人队列并保持停止。此安装包已包含新接口，无需打补丁。

插件下载：[Music Party 0.3.0](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.3.0)。项目与应用更新来源为 [tabidachinokaze/folia-major](https://github.com/tabidachinokaze/folia-major)。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游发行版迁移需安装本 fork 的安装包。后续新版本从本仓库 Releases 获取；Linux 现有包格式沿用手动安装升级。插件 ZIP 单独更新。

多人同步与聊天接收目前通过心跳和历史查询实现，尚未接入云信实时推送；真实网易云账号和官方 App 的跨端行为仍需验收。
