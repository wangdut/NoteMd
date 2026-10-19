// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { blocks, listHeadings, renderMarkdown, words } from '../src/renderer/src/markdown'

describe('Markdown source and rendering', () => {
  it('locates blocks after reference definitions and resolves reference images', () => {
    const source = '[pic]: assets/a.png\n\n# Heading\n\n![alt][pic]\n'
    expect(listHeadings(source)[0]!.line).toBe(3)
    for (const block of blocks(source)) expect(source.slice(block.from, block.to)).toBe(block.source)
    expect(renderMarkdown('![alt][pic]', source)).toContain('data-local-src="assets/a.png"')
  })
  it('keeps blank lines outside block replacements and locates real headings', () => {
    const source = '# 第一章\n\n\n```md\n# 假标题\n```\n\n## 第二章\n'
    expect(listHeadings(source).map(h => [h.text, h.line])).toEqual([['第一章', 1], ['第二章', 8]])
    for (const block of blocks(source)) expect(source.slice(block.from, block.to)).toBe(block.source)
    expect(blocks(source)[0]!.to).toBe(5)
    expect(source.slice(blocks(source)[0]!.to, blocks(source)[1]!.from)).toBe('\n\n\n')
  })
  it('renders tables, math, tasks, highlights and local image placeholders', () => {
    const html = renderMarkdown('# 标题\n\n[TOC]\n\n==重点== **粗体** <u>下划线</u> $x^2$\n\n- [x] 完成\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n![图](assets/a.png)')
    expect(html).toContain('document-toc'); expect(html).toContain('<mark>重点</mark>')
    expect(html).toContain('katex'); expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"'); expect(html).toContain('data-local-src="assets/a.png"')
    expect(html).not.toContain('src="assets/a.png" loading')
  })
  it('sanitizes script, event handlers and arbitrary CSS', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script><span style="position:fixed;color:red;background-image:url(https://example.com)">红色</span>')
    expect(html).not.toMatch(/onerror|<script|position|background-image/)
    expect(html).toContain('color: red')
  })
  it('counts Chinese and Latin words and creates stable duplicate slugs', () => {
    expect(words('你好 world 123')).toBe(4)
    const headings = listHeadings('# A\n\n# A\n'); expect(headings[1]!.id).toBe(headings[0]!.id + '-1')
  })
})
