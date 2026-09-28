# Music Party fork 与更新来源

本发行版仓库为 <https://github.com/tabidachinokaze/folia-major>，基于 [Folia 上游](https://github.com/chthollyphile/folia-major)，包含 Music Party 所需的 `externalPlayback v1` 播放适配接口。

插件独立仓库：<https://github.com/tabidachinokaze/folium-mod-music-party>。按插件 README 构建 ZIP 并安装到桌面模组系统；本 fork 无需再次应用插件仓库提供的兼容补丁。

## 推送代码后构建安装包

`Build Desktop` 工作流在 `main` 的桌面源码、依赖或打包配置变更后自动运行，也支持从 Actions 手动执行。它会分别构建 Windows、Linux、macOS 安装包及更新元数据，产物放在对应运行页面底部的 Artifacts 中：`folia-windows-latest`、`folia-ubuntu-latest`、`folia-macos-latest`，保留 14 天。

构建成功后，`Publish Desktop Release` 自动检查该构建的版本是否尚未发布，并将三个平台产物发布到 GitHub Releases。相同版本的后续代码构建仍会生成 Artifacts，但不会覆盖已发布安装包；需要发布更新时提高 `package.json` 及锁文件的版本，并更新发布说明。插件 ZIP 则在插件仓库的 `Build Folium plugin` 工作流中构建。

首次启用发布工作流时会查找最新成功的 `Build Desktop` 构建，直接发布已有产物；无需重新打包。也可以手动运行 `Publish Desktop Release` 并提供构建 run ID。发布前校验来源仓库、分支、提交、三平台产物以及更新元数据中的版本与 SHA-512；先上传到草稿，全部上传成功后自动正式发布。Release 标签指向产物的实际构建提交。

## 桌面应用更新

Folia 使用 `electron-updater`，从 GitHub Releases 读取安装包及更新元数据。本 fork 的构建配置、运行时检查地址和「查看发布」链接均指向 `tabidachinokaze/folia-major`。

| 通道 | GitHub Release | 更新元数据 |
| --- | --- | --- |
| Realeco 稳定版 | 最新正式 Release | `latest.yml` / 平台对应文件 |
| Limo 预览版 | `limo` | `beta.yml` / 平台对应文件 |
| Cielo 预览版 | `cielo` | `alpha.yml` / 平台对应文件 |
| Internal | 无自动更新 | 无 |

日常稳定版使用上面的 `Build Desktop` → `Publish Desktop Release` 自动流程。预览版仍使用原有工作流。它们都通过 `GITHUB_REPOSITORY` 将产物发布到当前 fork。原有 **Publish Realeco** 工作流也保留，使用它会生成草稿，需要手动正式发布；一般不需要与自动流程同时运行。

后续正式更新需要比已安装版本更高的版本号。自动流程会上传安装包及 electron-builder 生成的更新元数据；Windows/macOS 沿用应用更新器，Linux 当前包格式仍需下载后安装升级。首次从上游发行版迁移，应安装本 fork 构建的版本；原来的上游二进制仍然使用其原有更新地址。

## 插件更新

插件的 ZIP 在独立仓库构建。推送与 `package.json`、`mod.json` 一致的 `v*` 标签后，插件的 GitHub Actions 会运行检查并发布 ZIP。它不通过 Folia 的应用更新器升级；安装新 ZIP 后按 Folium 提示重新启用。

插件当前限定已验证的 Folia 0.7.9；升级宿主版本时需要同时验证插件并更新其兼容范围。
