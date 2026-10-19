# NoteMd

MIT 开源的 Windows Markdown 桌面编辑器。默认目录侧栏，单窗格即时渲染，源文本保留连续空行。

## 运行

Windows x64 便携包在 `release/NoteMd-0.2.0/NoteMd-0.2.0-x64.exe`；目录版位于 `release/NoteMd-0.2.0/win-unpacked/NoteMd.exe`。目录版需保留整个 `win-unpacked` 文件夹。

开发环境需要 Node.js 22 或更高版本、npm 和 Git：

```powershell
cd C:\Users\29003\Desktop\my_project\NoteMd
npm.cmd ci
npm.cmd run dev
```

构建与检查：

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd start
npm.cmd run dist:win
```

首次安装会下载 Electron。如果 npm 禁用依赖安装脚本，可运行 `node node_modules/electron/install.js`。网络较慢时可在当前终端设置 `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'` 后重试。镜像仅用于开发依赖下载，应用本身不需要联网登录。

## 主要功能

- 即时、源码、阅读三种模式；点击正文、图片、公式和代码保持渲染，完整 Markdown 在源码模式查看。
- 双击顶部标题或 F2 快速重命名；侧栏拖动改变宽度，双击分隔线复位。
- 正文右键菜单、可视化字体颜色面板、统一快捷键目录；Ctrl+Shift+7/8/9 分别切换有序/无序/任务列表。
- 表格指定正文行数和列数，单元格直接编辑，右键增删行列、对齐、改色；末格 Tab 自动增行。
- 图片选中后仍显示，上方路径工具栏可编辑说明和路径，支持复制图片；公式通过独立面板编辑。
- 连续空白行、UTF-8 BOM 与 Windows CRLF 换行保留；自动保存、撤销重做、查找替换。
- 标题、表格、列表、任务、引用、代码高亮、图片、链接、公式、内容目录、脚注、高亮、上下标、下划线和颜色。
- 默认 Windows 文档/NoteMd 文件库，文件菜单可修改路径。文件/文件夹创建、重命名、副本、移动、回收站、复制路径。
- 拖到条目上/下边缘排序，拖到文件夹中央移入；拖到返回按钮移到上一级。筛选期间先清空筛选再排序。
- 粘贴或插入图片存放于同级 `YYYYMMDD-HHmmss-NNN` 目录；自动隐藏资源目录，文档右键可查看。应用内移动/另存为复制图片并改写引用。
- 浅色、深色、暖纸主题；Ctrl+滚轮分别缩放正文与侧栏。
- 全窗口一致的主题菜单、Alt 菜单访问、F1 快捷键速览、命令面板、专注模式；HTML/PDF 导出。
- 磁盘冲突保护、关闭前保存、异常退出草稿恢复；文件操作拒绝目录穿越和符号链接。

## 文件与恢复

文件库中的 `.md` 文件可以直接被其他软件读取。图片目录与文档同级；在资源管理器中迁移时，请**同时携带 Markdown 和图片目录**。单独拖走 `.md` 文件无法让相对图片自动跟随。

图片被多个文档共享时，删除/移动文档不会删除原图片目录，避免影响其他文档。应用内跨目录移动会复制所引用的本地图片；文件夹整体移动保留内部结构。若文件夹内文档引用文件夹外图片，应用会提示先单独移动文档，不冒险破坏引用。

自动保存等待约 850ms；恢复草稿约 150ms 后写入应用数据目录。异常终止后重启会提示恢复，也可在“文件 → 恢复未保存草稿”中查看。若磁盘已被其他软件修改，会阻止覆盖，提供重新加载或另存副本。恢复机制不能替代常规备份。

## 当前边界

这是 0.2 版本。实时模式直接编辑正文和代码，图片/公式/表格使用独立交互节点；保留未修改的混合换行符和空白行。语法不正确的公式显示提示，可通过“编辑公式”修复，软件不会猜改原文。远程图片可复制 Markdown，本地位图可复制像素。图表/Mermaid、插件、云同步、大文件性能优化和系统文件关联尚未实现。支持 UTF-8 Markdown，其他编码请先转换。Windows 包未签商业代码证书。

## 项目目录

`src` 应用代码，`tests` 自动化测试，`docs` 设计与验收，`scripts` 构建与验证脚本，`third-party` 许可证及实际复用片段，`resources` 图标，`examples` 示例。`node_modules` 为本地依赖，`.cache` 为弱网环境保留的构建缓存；`dist`、`release`、`artifacts`、`test-results` 为被 Git 忽略的生成目录。私人测试文档只保留忽略目录内副本，不提交 Git。

## 项目文档

- [产品需求与验收](docs/product-requirements.md)
- [架构设计](docs/design.md)
- [0.2 交互设计](docs/interaction-v2.md)
- [进度与验证记录](docs/progress.md)
- [使用示例](examples/欢迎使用.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)

本项目不隶属于 Typora 或 MarkText。复用 MarkText 的独立 Markdown 扩展并保留 MIT 许可；编辑状态直接保留源文本。自有图标 SVG/PNG/ICO 与生成脚本一并开放。
