# Folia {{VERSION}} · Music Party

此版本基于 Folia 0.7.9，加入网易云官方多人一起听插件所需的播放适配。项目与应用更新来源均为 [tabidachinokaze/folia-major](https://github.com/tabidachinokaze/folia-major)。

- 配合 [Music Party 插件](https://github.com/tabidachinokaze/folium-mod-music-party/releases)，支持在 Folia 中加入官方多人房间、同步音乐、推歌、管理待播列表、查看成员与聊天。
- 保留 Folia 的音频播放和歌词界面，房间内手动切歌与歌曲自然结束分别处理，退出后恢复个人队列。
- 此安装包已包含播放适配接口，无需再次应用补丁。安装后请在「设置 → 实验室」开启模组系统，并导入插件 ZIP。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游发行版迁移需安装本 fork 的安装包。后续新版本从本仓库 Releases 获取；Linux 现有包格式沿用手动安装升级。插件 ZIP 单独更新。

多人同步与聊天接收目前通过心跳和历史查询实现，尚未接入云信实时推送；真实网易云账号和官方 App 的跨端行为仍需验收。
