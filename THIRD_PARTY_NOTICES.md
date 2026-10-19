# 第三方来源

NoteMd 自有代码采用 MIT。第三方代码遵循其原许可。

## MarkText

- 来源：[MarkText](https://github.com/marktext/marktext)，作者 Luo Ran 与 MarkText Contributors。
- 来源快照：用户于 2026-10-19 提供的 `../marktext-develop` 下载目录。该下载不含可核验的 Git 提交信息，不宣称对应特定 commit。
- 原许可：[`third-party/marktext/LICENSE`](third-party/marktext/LICENSE)（MIT）。
- 复用文件保留上游代码；上游作者声明各自版权及 MIT 许可。NoteMd 在上游设计基础上组合和整合这些 Marked 扩展。

复用的 MarkText 文件：

| NoteMd 路径 | MarkText 原路径 | 用途 |
|---|---|---|
| `third-party/marktext/packages/muya/src/utils/marked/extensions/math.ts` | `packages/muya/src/utils/marked/extensions/math.ts` | KaTeX 行间、块级数学与 pandoc/GFM 扩展 tokenization |
| `third-party/marktext/packages/muya/src/utils/marked/extensions/mark.ts` | `packages/muya/src/utils/marked/extensions/mark.ts` | `==标记文本==` 高亮语法 |
| `third-party/marktext/packages/muya/src/utils/marked/extensions/superSubscript.ts` | `packages/muya/src/utils/marked/extensions/superSubscript.ts` | 上下标语法 |
| `third-party/marktext/packages/muya/src/utils/slug.ts` | `packages/muya/src/utils/slug.ts` | CJK/Unicode 锚点 slug |
| `third-party/marktext/packages/muya/src/utils/marked/extensions/footnote.ts` | `packages/muya/src/utils/marked/extensions/footnote.ts` | 脚注语法 |

MarkText 的 Muya 编辑器整体采用块树序列化；NoteMd 不复用此编辑状态转换流程，避免它规范化源文档的空白段落。NoteMd 自身依赖和资产采用各自许可。

0.2 交互改版参考完整本地 MarkText 仓库 commit `4df6a05a978d09aee450c77ee8cbc0c07510aaf5` 的图片工具、公式预览与表格行为。本轮未复制完整 Muya 内核；以上已有复用文件仍保留原来源记录。
