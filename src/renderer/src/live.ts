import { Compartment, EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { blocks, renderMarkdown, resolveImages } from './markdown'

export type EditorMode = 'live' | 'source' | 'read'
export const changeMode = StateEffect.define<EditorMode>()
const modeField = StateField.define<EditorMode>({ create: () => 'live', update: (value, tr) => tr.effects.reduce((v, e) => e.is(changeMode) ? e.value : v, value) })
const editable = new Compartment()
class BlockWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly identifier: string, readonly mode: EditorMode, readonly documentSource: string) { super() }
  eq(other: BlockWidget): boolean { return this.source === other.source && this.from === other.from && this.identifier === other.identifier && this.mode === other.mode && (!/\[toc\]/i.test(this.source) || this.documentSource === other.documentSource) }
  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('div')
    node.className = 'live-block markdown-body'
    node.innerHTML = renderMarkdown(this.source, this.documentSource)
    resolveImages(node, this.identifier)
    node.addEventListener('mousedown', event => {
      const target = event.target as HTMLElement
      const link = target.closest('a')
      if (link) {
        event.preventDefault()
        const line = Number(link.dataset.line)
        if (line) view.dispatch({ selection: { anchor: view.state.doc.line(Math.min(line, view.state.doc.lines)).from }, scrollIntoView: true })
        else { const href = link.getAttribute('href'); if (href && /^(https?:|mailto:)/.test(href)) void window.noteMd.openLink(href) }
        return
      }
      if (this.mode === 'read') return
      event.preventDefault()
      const row = Math.max(0, Math.min(this.source.split('\n').length - 1, Math.floor((event.clientY - node.getBoundingClientRect().top) / 28)))
      const position = this.from + this.source.split('\n').slice(0, row).reduce((n, line) => n + line.length + 1, 0)
      view.dispatch({ selection: { anchor: position } })
      view.focus()
    })
    return node
  }
  ignoreEvent(): boolean { return true }
}
export function liveRendering(identifier: string) {
  const field = StateField.define<DecorationSet>({
    create: state => build(state),
    update: (value, tr) => tr.docChanged || tr.selection || tr.effects.some(e => e.is(changeMode)) ? build(tr.state) : value,
    provide: f => EditorView.decorations.from(f),
  })
  return [modeField, field, editable.of(EditorView.editable.of(true))]
  function build(state: EditorState): DecorationSet {
    const mode = state.field(modeField)
    if (mode === 'source') return Decoration.none
    const text = state.doc.toString()
    const ranges: Range<Decoration>[] = []
    for (const block of blocks(text)) {
      if (mode === 'live' && state.selection.ranges.some(s => s.from <= block.to && s.to >= block.from)) continue
      ranges.push(Decoration.replace({ widget: new BlockWidget(block.source, block.from, identifier, mode, text), block: true }).range(block.from, block.to))
    }
    return Decoration.set(ranges, true)
  }
}
export function setEditorMode(view: EditorView, mode: EditorMode): void {
  view.dispatch({ effects: [changeMode.of(mode), editable.reconfigure(EditorView.editable.of(mode !== 'read'))] })
}
