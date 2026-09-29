# Folia {{VERSION}} · Music Party

**配套升级：Folia 0.7.10 + Music Party 插件 0.2.0。** 本版使用新的播放会话接口，旧插件 0.1.0 需要一并升级。项目与应用更新来源均为 [tabidachinokaze/folia-major](https://github.com/tabidachinokaze/folia-major)。

- 统一进度条、键盘、遥控及批量入队操作，避免绕过房间的播放控制。
- 会话退出、模组停用或加载被替代后，旧的在线、本地及 Navidrome 加载不会再覆盖新的播放状态；取消时回收未使用的音源资源。
- 模组异常或卸载后正确释放播放接管，退出时恢复个人队列并保持停止。
- 保留 Folia 的音频与歌词体验。创建、加入、恢复官方多人房间，以及聊天、私信邀请等功能由 [Music Party 插件 0.2.0](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.2.0) 提供。
- 此安装包已包含新接口，无需打补丁。安装插件 ZIP 后按提示重新启用；进入房间前需结束私人 FM、Stage、视频录制或混音过渡。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游发行版迁移需安装本 fork 的安装包。后续新版本从本仓库 Releases 获取；Linux 现有包格式沿用手动安装升级。插件 ZIP 单独更新。

多人同步与聊天接收目前通过心跳和历史查询实现，尚未接入云信实时推送；真实网易云账号和官方 App 的跨端行为仍需验收。
