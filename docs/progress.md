# 进度与验证

## A · 设计

- 已整理用户 10 项要求、验收条件、架构和数据保护策略。
- 依据用户提供的 `../marktext-develop` 调查 MarkText 的 Muya 块树序列化，确认不复用其序列化编辑内核；空白行优先于该迁移捷径。
- 已复制 MarkText math、mark/highlight、super/subscript、CJK Unicode slug 扩展并保留上游 MIT 许可与来源路径；待挂接渲染器验证。

## B · 文件内核（实现中）

- 支持在 NoteMd 文件库下安全列出、创建、排序、重命名、移动及删除 Markdown/文件夹；隐藏带标记的图片资源目录。
- 粘贴图片分配唯一的日期序号资源目录与可引用文件名；文档安全保存比较磁盘内容哈希、原子替换；跨文件夹移动复制本地 Markdown 图片至新资源目录并改写引用。
- 待写 Vitest 文件服务回归测试、补充系统回收站操作并接入 Electron IPC。
