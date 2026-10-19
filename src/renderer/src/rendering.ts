import { Compartment, EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { Lexer, type Token } from 'marked'
import { blocks, markdown, renderMarkdown } from './markdown'
import { PreviewWidget, MarkerWidget, clearNode } from './nodes'

export type EditorMode = 'live' | 'source' | 'read'
export const changeMode = StateEffect.define<EditorMode>()
const modeField = StateField.define<EditorMode>({ create: () => 'live', update: (value, tr) => tr.effects.reduce((v, e) => e.is(changeMode) ? e.value : v, value) })
const editable = new Compartment()
export function liveRendering(identifier: string) {
  const field = StateField.define<DecorationSet>({
    create: state => build(state),
    update: (value, tr) => tr.docChanged || tr.effects.some(e => e.is(changeMode)) ? build(tr.state) : value,
    provide: f => [EditorView.decorations.from(f), EditorView.atomicRanges.of(view => {
      const atoms: Range<Decoration>[] = []; view.state.field(f).between(0, view.state.doc.length, (from,to,value) => { if (value.spec.widget || value.spec.isHidden) atoms.push(value.range(from,to)) }); return Decoration.set(atoms, true)
    })],
  })
  return [modeField, field, editable.of(EditorView.editable.of(true)), EditorView.domEventHandlers({ mousedown(event, view) { if (!(event.target as HTMLElement).closest('.preview-node,.node-tools')) clearNode(view); return false } })]
  function build(state: EditorState): DecorationSet {
    const mode = state.field(modeField); if (mode === 'source') return Decoration.none
    const source = state.doc.toString(); const ranges: Range<Decoration>[] = []
    const hide = (from: number, to: number) => { if (to > from) ranges.push(Decoration.replace({ isHidden: true }).range(from, to)) }
    const mark = (from: number, to: number, spec: Parameters<typeof Decoration.mark>[0]) => { if (to > from) ranges.push(Decoration.mark(spec).range(from, to)) }
    const lineStyle = (from: number, cls: string) => ranges.push(Decoration.line({ class: cls }).range(from))
    const preview = (from: number, to: number, kind: string, block = false) => { if (to > from) ranges.push(Decoration.replace({ widget: new PreviewWidget(source.slice(from, to), from, identifier, kind, mode === 'read', source), block }).range(from, to)) }
    function walk(tokens: Token[] | undefined, text: string, from: number) { let offset = 0; for (const token of tokens ?? []) { const at = text.indexOf(token.raw, offset); if (at < 0) continue; offset = at + token.raw.length; renderToken(token, from + at) } }
    function renderToken(token: Token, from: number) {
      const t = token as Token & { text?: string; tokens?: Token[]; href?: string }; const to = from + t.raw.length
      if (t.type === 'image') { preview(from, to, 'image'); return }
      if (/math/i.test(t.type)) { preview(from, to, t.raw.startsWith('$$') ? 'math' : 'inline-math'); return }
      const classes: Record<string,string> = { strong: 'live-bold', em: 'live-italic', del: 'live-strike', mark: 'live-highlight', codespan: 'live-code', superscript: 'live-super', subscript: 'live-sub' }
      if (classes[t.type] && t.text !== undefined) { const prefix = t.type === 'codespan' ? t.raw.match(/^`+/)![0].length : ['strong','del','mark'].includes(t.type) ? 2 : 1; hide(from, from + prefix); hide(to - prefix, to); mark(from + prefix, to - prefix, { class: classes[t.type] }); if (t.type !== 'codespan') walk(t.tokens, t.text, from + prefix); return }
      if (t.type === 'link' && t.text !== undefined) { const prefix = t.raw.indexOf(t.text); hide(from, from + prefix); hide(from + prefix + t.text.length, to); mark(from + prefix, from + prefix + t.text.length, { tagName: 'a', attributes: { href: t.href ?? '', title: 'Ctrl+单击打开链接' } }); walk(t.tokens, t.text, from + prefix); return }
      if (t.type === 'escape') hide(from, from + 1)
      else if (t.tokens) walk(t.tokens, t.raw, from)
    }
    const lexer = new Lexer(markdown.defaults); lexer.tokens.links = markdown.lexer(source).links
    for (const block of blocks(source)) {
      if (mode === 'read') { preview(block.from, block.to, 'read', true); continue }
      if (block.type === 'table' || /math|equation/i.test(block.type) || block.source.toUpperCase() === '[TOC]' || block.type === 'hr') { preview(block.from, block.to, /math|equation/i.test(block.type) ? 'math' : block.type, true); continue }
      if (block.type === 'code') {
        const first = state.doc.lineAt(block.from), last = state.doc.lineAt(block.to); const fenced = /^\s*(`{3,}|~{3,})/.test(first.text)
        for (let n = first.number; n <= last.number; n++) { const line = state.doc.line(n); if (fenced && (n === first.number || (n === last.number && /^\s*(`{3,}|~{3,})\s*$/.test(line.text)))) { lineStyle(line.from, 'code-fence'); hide(line.from, line.to) } else { lineStyle(line.from, 'live-code-line'); if (!fenced && /^ {4}/.test(line.text)) hide(line.from, line.from + 4) } }
        continue
      }
      const first = state.doc.lineAt(block.from), last = state.doc.lineAt(block.to)
      for (let n = first.number; n <= last.number; n++) {
        const line = state.doc.line(n); let text = line.text, start = line.from
        const mathStart=text.replace(/^\s*(?:>\s*)+/,'').trim()
        if(mathStart==='$$'){let end=n+1;while(end<=last.number&&state.doc.line(end).text.replace(/^\s*(?:>\s*)+/,'').trim()!=='$$')end++;if(end<=last.number){preview(line.from,state.doc.line(end).to,'math',true);n=end;continue}}
        const heading = text.match(/^(#{1,6})\s+/)
        if (heading) { lineStyle(start, 'live-heading live-h' + heading[1]!.length); hide(start, start + heading[0].length); text = text.slice(heading[0].length); start += heading[0].length }
        const quote = text.match(/^\s*(?:>\s*)+/); if (quote) { lineStyle(line.from, 'live-quote'); hide(start, start + quote[0].length); text = text.slice(quote[0].length); start += quote[0].length }
        const list = text.match(/^(\s*)([-+*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?/)
        if (list) { const end = start + list[0].length; const checked = list[3] !== undefined ? list[3]!.toLowerCase() === 'x' : undefined; const checkAt = start + list[0].lastIndexOf('[') + 1; ranges.push(Decoration.replace({ widget: new MarkerWidget(/^\d/.test(list[2]!) ? list[2]! : '•', checkAt, checked) }).range(start + list[1]!.length, end)); lineStyle(line.from, 'live-list-line'); text = text.slice(list[0].length); start = end }
        walk(lexer.inlineTokens(text), text, start)
        for (const match of text.matchAll(/<(u|span|font|mark)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
          const at = start + match.index!; const prefix = match[0].indexOf('>') + 1; hide(at, at + prefix); hide(at + prefix + match[2]!.length, at + match[0].length)
          const host = document.createElement('span'); host.innerHTML = renderMarkdown(match[0]); const element = host.querySelector<HTMLElement>('span[style],font,u,mark'); const color = element?.style.color
          mark(at + prefix, at + prefix + match[2]!.length, { class: match[1] === 'u' ? 'live-underline' : match[1] === 'mark' ? 'live-highlight' : '', attributes: color ? { style: 'color:' + color } : {} })
        }
      }
    }
    return Decoration.set(ranges, true)
  }
}
export function setEditorMode(view: EditorView, mode: EditorMode, busy = false): void {
  const changed = mode !== view.state.field(modeField); if (changed) clearNode(view)
  view.dispatch({ effects: [...(changed ? [changeMode.of(mode)] : []), editable.reconfigure([EditorView.editable.of(mode !== 'read' && !busy), EditorState.readOnly.of(mode === 'read' || busy)])] })
}
