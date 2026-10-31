# NoteMd 版本与发行约定

当前版本：0.3.0。每个发布版本使用独立目录，不再以旧版本号混放更新后的程序。

## 版本来源

package.json 的 version 是唯一应用版本来源。package-lock.json 顶层及根包版本须同步；依赖自身版本不得批量替换。关于页面读取应用版本，Electron Builder 据此写入 EXE 产品信息并展开输出目录。

新增用户功能提升次版本，例如 0.2.0 → 0.3.0；同一功能集的修补使用补丁版本，例如 0.3.0 → 0.3.1。正式交付后的版本不用于发布不同代码，历史程序保留回退用途。

## 输出结构

目录：release/

- README.txt：当前版本索引。
- NoteMd-0.3.0/：本次完整发行目录。
  - NoteMd-0.3.0-x64.exe：单文件便携版。
  - win-unpacked/NoteMd.exe：目录免安装版入口，整个 win-unpacked 文件夹必须一起保留。
  - NoteMd-0.3.0-win-x64.zip：发布 GitHub 时生成的目录版分发包，包含完整 win-unpacked 以及说明、更新日志与许可文件；需完整解压运行。
  - README.md、CHANGELOG.md：本版本用法与更新内容。
  - SHA256SUMS.txt：两个 EXE 与 resources/app.asar 的校验值；GitHub 发布时追加目录版 ZIP 的校验值。
  - release-manifest.json：版本、构建时间、代码提交与产物信息。
  - LICENSE、THIRD_PARTY_NOTICES.md：许可说明。
  - builder-debug.yml：构建诊断记录。
- NoteMd-0.2.0/、NoteMd-0.1.0/：历史版本。
- archive/：旧版零散构建归档。

便携版与目录免安装版都是免安装运行方式，区别在于一个文件分发或整个文件夹分发。二者使用同一版本功能，设置和文档使用已有配置路径，不承诺自动随程序迁移。当前没有安装向导版。

## 发布步骤

1. 在 NoteMd 项目目录更新版本、更新日志、README、需求/设计说明和工作区索引。历史验证日期和旧提交记录保留原样并注明历史。
2. 执行 npm.cmd run check 和 npm.cmd test，修正失败后本地提交代码与文档。
3. 执行 npm.cmd run dist:win。该命令构建应用、打包 x64 便携版和目录版，并运行 scripts/release-metadata.mjs 生成校验、清单和说明。npm.cmd run pack 仅生成目录版，用于调试，不代表完整发行已完成。
4. 对本次目录版运行完整 Electron 测试，再对本次单文件包运行冒烟测试。
5. 核对两个 EXE 的文件属性版本和程序“关于”版本为当前版本；校验文件哈希；在 docs/progress.md 记录实际结果并本地提交。
6. 将完整 win-unpacked、发行目录 README、CHANGELOG、LICENSE、THIRD_PARTY_NOTICES 打成 NoteMd-<版本>-win-x64.zip。逐项核对压缩包内文件的数量、大小和 SHA256，禁止混入测试数据、缓存和私有配置。ZIP 放回本版本发行目录；把其文件名、大小与 SHA256 追加到清单和校验文件，不覆盖原构建时间与源提交。
7. 推送 main，再为已验证的发行提交创建并推送 v<版本> 标签。创建 GitHub Release 草稿，附中文更新说明与两种运行形式的说明。上传便携 EXE、目录版 ZIP、SHA256SUMS.txt、release-manifest.json。GitHub 的 Source code 是源码下载，不属于可运行发行包。
8. 将每个附件的服务端文件大小、上传状态和 SHA256 与本地核对后，正式发布 Release；匿名检查发布页及附件可见。README 增加下载链接，docs/progress.md 记录发布结果，再提交并推送文档。发行标签固定指向已验证的发行提交，发布记录的后续文档提交无需改动标签或重打包程序。

网络失败时保留本地提交、产物与远端草稿，优先继续独立工作；恢复后先核对已有附件，避免重复上传或覆盖。生成目录与私人测试数据不进入 Git。

测试命令（PowerShell，在 NoteMd 项目内）：

    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $env:NOTEMD_TEST_EXECUTABLE = (Resolve-Path "release/NoteMd-$version/win-unpacked/NoteMd.exe").Path
    try { npm.cmd run test:e2e } finally { Remove-Item Env:NOTEMD_TEST_EXECUTABLE -ErrorAction SilentlyContinue }
    npm.cmd run test:portable

测试使用隔离配置和文档库。便携冒烟验证也接受显式路径：node scripts/portable-smoke.mjs <EXE路径>。

## 文档维护

- README：当前版本、运行路径、实际功能、数据目录、使用边界与文档入口。
- CHANGELOG：用户可见变化以及发行变化。
- docs/product-requirements.md、docs/design.md：随行为/架构变更更新。
- docs/progress.md：最新验证放在开头，历史记录不冒充当前状态。
- scripts/release-metadata.mjs：自动按项目版本生成发行目录说明，避免手写错路径。
