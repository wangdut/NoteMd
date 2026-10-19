import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import mathExtension from '../../../third-party/marktext/packages/muya/src/utils/marked/extensions/math'
import markExtension from '../../../third-party/marktext/packages/muya/src/utils/marked/extensions/mark'
import superSubscriptExtension from '../../../third-party/marktext/packages/muya/src/utils/marked/extensions/superSubscript'
import footnoteExtension from '../../../third-party/marktext/packages/muya/src/utils/marked/extensions/footnote'
import { generateGithubSlug } from '../../../third-party/marktext/packages/muya/src/utils/slug'

export const markdown = new Marked({ gfm: true, breaks: false, async: false })
markdown.use(mathExtension({ useKatexRender: true, throwOnError: false }), markExtension(), superSubscriptExtension(), footnoteExtension(), {
  renderer: { code({ text, lang }) {
    const language = lang?.split(/\s/, 1)[0] ?? ''
    const result = hljs.getLanguage(language) ? hljs.highlight(text, { language }).value : escapeHtml(text)
    return '<pre><code class="hljs">' + result + '</code></pre>\n'
  } },
})
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]!))
}
export interface Heading { level: number; text: string; line: number; from: number; id: string }
export interface MarkdownBlock { from: number; to: number; source: string; type: string }
export function blocks(source: string): MarkdownBlock[] {
  let offset = 0
  return markdown.lexer(source).flatMap(token => {
    const from = offset; offset += token.raw.length
    const text = token.raw.replace(/\n+$/, '')
    if (token.type === 'space' || !text.trim()) return []
    return [{ from, to: from + text.length, source: text, type: token.type }]
  })
}
export function listHeadings(source: string): Heading[] {
  const seen = new Map<string, number>(); let offset = 0
  return markdown.lexer(source).flatMap(token => {
    const from = offset; offset += token.raw.length
    if (token.type !== 'heading') return []
    const text = token.text.replace(/\*\*|__|~~|`/g, '')
    const base = generateGithubSlug(text) || 'section'
    const count = seen.get(base) ?? 0; seen.set(base, count + 1)
    return [{ level: token.depth, text, from, line: source.slice(0, from).split('\n').length, id: base + (count ? '-' + count : '') }]
  })
}
export function renderMarkdown(source: string, allSource = source): string {
  const headings = listHeadings(allSource)
  const toc = '<nav class="document-toc"><strong>内容目录</strong>' + headings.map(h => '<a href="#' + h.id + '" data-line="' + h.line + '">' + escapeHtml(h.text) + '</a>').join('') + '</nav>'
  const raw = markdown.parse(source, { async: false }).replace(/<p>\[TOC\]<\/p>/gi, toc)
  const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true, mathMl: true, svg: true }, FORBID_TAGS: ['style', 'iframe', 'form', 'object', 'embed'], ADD_ATTR: ['data-identifier', 'data-line'] })
  const template = document.createElement('template'); template.innerHTML = clean
  template.content.querySelectorAll<HTMLElement>('[style]').forEach(element => {
    const allowed = ['color', 'background-color']
    if (element.closest('.katex')) allowed.push('height', 'width', 'min-width', 'top', 'bottom', 'left', 'right', 'margin-left', 'margin-right', 'margin-top', 'padding-left', 'vertical-align', 'font-size', 'border-bottom-width', 'position')
    const styles = allowed.map(key => [key, element.style.getPropertyValue(key)])
    element.removeAttribute('style')
    for (const [key, value] of styles) if (value && !/url|expression|fixed/i.test(value)) element.style.setProperty(key!, value)
  })
  template.content.querySelectorAll<HTMLImageElement>('img').forEach(image => {
    const src = image.getAttribute('src') ?? ''
    if (src && !/^(?:https?:|data:image\/)/i.test(src)) { image.dataset.localSrc = src; image.removeAttribute('src') }
    image.loading = 'lazy'
  })
  template.content.querySelectorAll<HTMLElement>('.footnote-ref').forEach(e => { e.textContent = '[' + (e.dataset.identifier ?? '') + ']'; e.classList.add('footnote-label') })
  template.content.querySelectorAll<HTMLElement>('.footnote-block').forEach(e => { const label = document.createElement('strong'); label.textContent = '[' + (e.dataset.identifier ?? '') + '] '; e.prepend(label) })
  const localHeadings = listHeadings(source)
  template.content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((e, i) => { if (localHeadings[i]) e.id = localHeadings[i].id })
  return template.innerHTML
}
export function resolveImages(root: HTMLElement, identifier: string): void {
  root.querySelectorAll<HTMLImageElement>('img[data-local-src]').forEach(image => {
    void window.noteMd.resolveImage(identifier, image.dataset.localSrc!).then(src => { image.src = src }).catch(() => { image.alt = '图片不可用：' + image.alt; image.classList.add('image-missing') })
  })
}
export function words(source: string): number { return source.match(/\p{Script=Han}|[\p{L}\p{N}]+/gu)?.length ?? 0 }
