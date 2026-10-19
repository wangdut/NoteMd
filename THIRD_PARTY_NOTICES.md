# 第三方来源

NoteMd 自有代码采用 MIT。第三方代码遵循其原许可。

## MarkText

- 来源：[MarkText](https://github.com/marktext/marktext)，作者 Luo Ran 与 MarkText Contributors。
- 上游快照：`4df6a05a978d09aee450c77ee8cbc0c07510aaf5`（2026-10-19）。参考工作区：`../marktext-develop`。
- 原许可：[`third-party/marktext/LICENSE`](third-party/marktext/LICENSE)（MIT）。
- 复用文件保留上游代码；上游作者声明各自版权及 MIT 许可。NoteMd 在上游设计基础上组合和整合这些 Marked 扩展。

复用的 MarkText 文件：

| NoteMd 路径 | MarkText 原路径 | 用途 |
|---|---|---|
| `third-party/marktext/packages/muya/src/utils/marked/extensions/math.ts` | `packages/muya/src/utils/marked/extensions/math.ts` | KaTeX 行间、块级数学与 pandoc/GFM 扩展 tokenization |
| `third-party/marktext/packages/muya/src/utils/marked/extensions/mark.ts` | `packages/muya/src/utils/marked/extensions/mark.ts` | `==标记文本==` 高亮语法 |
| `third-party/marktext/packages/muya/src/utils/marked/extensions/superSubscript.ts` | `packages/muya/src/utils/marked/extensions/superSubscript.ts` | 上下标语法 |
| `third-party/marktext/packages/muya/src/utils/slug.ts` | `packages/muya/src/utils/slug.ts` | CJK/Unicode 锚点 slug |

MarkText 的 Muya 编辑器整体采用块树序列化；NoteMd 不复用此编辑状态转换流程，避免它规范化源文档的空白段落。NoteMd 自身依赖和资产采用各自许可。
