# NoteMd

MIT 开源的 Windows Markdown 桌面编辑器。默认目录侧栏，单窗格即时渲染，源文本保留连续空行。

## 运行

Windows x64 便携包在 `release/NoteMd-0.1.0/NoteMd-0.1.0-x64.exe`；目录版位于 `release/NoteMd-0.1.0/win-unpacked/NoteMd.exe`。目录版需保留整个 `win-unpacked` 文件夹。

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

- 即时、源码、阅读三种模式；即时模式光标所在块显露 Markdown，其余块实时排版。
- 连续空白行、UTF-8 BOM 与 Windows CRLF 换行保留；自动保存、撤销重做、查找替换。
- 标题、表格、列表、任务、引用、代码高亮、图片、链接、公式、内容目录、脚注、高亮、上下标、下划线和颜色。
- 默认 Windows 文档/NoteMd 文件库，文件菜单可修改路径。文件/文件夹创建、重命名、副本、移动、回收站、复制路径。
- 拖到条目上/下边缘排序，拖到文件夹中央移入；拖到返回按钮移到上一级。筛选期间先清空筛选再排序。
- 粘贴或插入图片存放于同级 `YYYYMMDD-HHmmss-NNN` 目录；自动隐藏资源目录，文档右键可查看。应用内移动/另存为复制图片并改写引用。
- 浅色、深色、暖纸主题；Ctrl+滚轮分别缩放正文与侧栏。
- 原生中文菜单、命令面板、专注模式；HTML/PDF 导出。HTML 内嵌本地图片和数学字体。
- 磁盘冲突保护、关闭前保存、异常退出草稿恢复；文件操作拒绝目录穿越和符号链接。

## 文件与恢复

文件库中的 `.md` 文件可以直接被其他软件读取。图片目录与文档同级；在资源管理器中迁移时，请**同时携带 Markdown 和图片目录**。单独拖走 `.md` 文件无法让相对图片自动跟随。

图片被多个文档共享时，删除/移动文档不会删除原图片目录，避免影响其他文档。应用内跨目录移动会复制所引用的本地图片；文件夹整体移动保留内部结构。若文件夹内文档引用文件夹外图片，应用会提示先单独移动文档，不冒险破坏引用。

自动保存等待约 850ms；恢复草稿约 150ms 后写入应用数据目录。异常终止后重启会提示恢复，也可在“文件 → 恢复未保存草稿”中查看。若磁盘已被其他软件修改，会阻止覆盖，提供重新加载或另存副本。恢复机制不能替代常规备份。

## 当前边界

这是 0.1 版本。即时编辑以块为单位，不是 Typora 的完全复刻；图表/Mermaid、插件、云同步、大文件性能优化和系统文件关联尚未实现。支持 UTF-8 Markdown，其他编码请先转换。语法扩展在其他编辑器中的支持程度不同。Windows 包未签商业代码证书，可能出现系统信誉提示。

## 项目文档

- [产品需求与验收](docs/product-requirements.md)
- [架构设计](docs/design.md)
- [进度与验证记录](docs/progress.md)
- [使用示例](examples/欢迎使用.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)

本项目不隶属于 Typora 或 MarkText。复用 MarkText 的独立 Markdown 扩展并保留 MIT 许可；编辑状态直接保留源文本。自有图标 SVG/PNG/ICO 与生成脚本一并开放。
