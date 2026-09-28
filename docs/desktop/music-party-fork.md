# Music Party fork 与更新来源

本发行版仓库为 <https://github.com/tabidachinokaze/folia-major>，基于 [Folia 上游](https://github.com/chthollyphile/folia-major)，包含 Music Party 所需的 `externalPlayback v1` 播放适配接口。

插件独立仓库：<https://github.com/tabidachinokaze/folium-mod-music-party>。按插件 README 构建 ZIP 并安装到桌面模组系统；本 fork 无需再次应用插件仓库提供的兼容补丁。

## 推送代码后构建安装包

`Build Desktop` 工作流在 `main` 的桌面源码、依赖或打包配置变更后自动运行，也支持从 Actions 手动执行。它会分别构建 Windows、Linux、macOS 安装包及更新元数据，产物放在对应运行页面底部的 Artifacts 中：`folia-windows-latest`、`folia-ubuntu-latest`、`folia-macos-latest`，保留 14 天。

这个流程用于获取当前提交的桌面安装包；GitHub Releases 正式发布使用下面的发布流程。插件 ZIP 则在插件仓库的 `Build Folium plugin` 工作流中构建，两个仓库的 Artifacts 分别下载。

## 桌面应用更新

Folia 使用 `electron-updater`，从 GitHub Releases 读取安装包及更新元数据。本 fork 的构建配置、运行时检查地址和「查看发布」链接均指向 `tabidachinokaze/folia-major`。

| 通道 | GitHub Release | 更新元数据 |
| --- | --- | --- |
| Realeco 稳定版 | 最新正式 Release | `latest.yml` / 平台对应文件 |
| Limo 预览版 | `limo` | `beta.yml` / 平台对应文件 |
| Cielo 预览版 | `cielo` | `alpha.yml` / 平台对应文件 |
| Internal | 无自动更新 | 无 |

这些通道仍使用原有发布工作流；工作流通过 `GITHUB_REPOSITORY` 将产物发布到当前 fork。稳定版可以在 GitHub Actions 手动运行 **Publish Realeco**，也可以按项目规范更新 `realeco-release` 触发。工作流生成草稿 Release，核对安装包和更新元数据后，需要将草稿正式发布，客户端才能发现更新。

推送源码本身不会生成桌面应用更新。后续正式更新需要比已安装版本更高的版本号，且 Release 中必须包含对应平台安装包及 electron-builder 生成的更新元数据。首次从上游发行版迁移，应安装本 fork 构建的版本；原来的上游二进制仍然使用其原有更新地址。

## 插件更新

插件的 ZIP 在独立仓库构建。推送与 `package.json`、`mod.json` 一致的 `v*` 标签后，插件的 GitHub Actions 会运行检查并发布 ZIP。它不通过 Folia 的应用更新器升级；安装新 ZIP 后按 Folium 提示重新启用。

插件当前限定已验证的 Folia 0.7.9；升级宿主版本时需要同时验证插件并更新其兼容范围。
