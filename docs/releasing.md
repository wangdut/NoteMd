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
  - README.md、CHANGELOG.md：本版本用法与更新内容。
  - SHA256SUMS.txt：两个 EXE 与 resources/app.asar 的校验值。
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
6. 最后推送 GitHub。网络失败时保留本地提交与产物，记录状态，不影响本地使用。生成目录与私人测试数据不进入 Git。

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
