# Folia {{VERSION}} · Music Party 私信优化

**配套升级：Folia 0.7.12 + Music Party 插件 0.3.1。** 请先升级 Folia，再安装并重新启用插件。本版修复首页插件容器高度，私信无需整页滚动。

- 固定高度双栏私信页面，会话与消息列表独立滚动；会话显示头像、用户名和最新消息预览。
- 会话和历史消息滚动自动加载，保留阅读位置；刷新与邀请按钮移至对应标题右侧。
- 私信反馈与房间点赞等状态隔离；图片等附件不再重复显示占位文字，文本气泡按内容宽度显示。
- 配套插件提供 Emoji、颜文字、图片发送、自定义表情上传及多选删除，浮层适配主题和窄窗口。

插件下载：[Music Party 0.3.1](https://github.com/tabidachinokaze/folium-mod-music-party/releases/tag/v0.3.1)。图片上传及表情删除已通过模拟接口验证，仍需真实账号验收。

## 下载

- Windows：`.exe` 安装包。
- macOS：按 CPU 架构选择 `.dmg`；首次打开未签名应用的说明见 [macOS 安装说明](https://github.com/tabidachinokaze/folia-major/blob/main/docs/desktop/macos-app-damaged.md)。
- Linux：按发行版选择 `.deb`、`.rpm` 或 `.tar.gz`。
- `SHA256SUMS` 提供安装包校验值。`.yml`、`.blockmap` 和 macOS `.zip` 同时供应用更新器使用。

首次从上游发行版迁移需安装本 fork 的安装包。后续新版本从本仓库 Releases 获取；Linux 现有包格式沿用手动安装升级。插件 ZIP 单独更新。

多人同步与聊天接收目前通过心跳和历史查询实现，尚未接入云信实时推送；真实网易云账号和官方 App 的跨端行为仍需验收。
