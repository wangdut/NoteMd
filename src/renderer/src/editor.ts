import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown as markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { searchKeymap } from '@codemirror/search'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView, keymap } from '@codemirror/view'
import { liveRendering } from './live'

export function createMarkdownEditor(
  parent: HTMLElement,
  initialText: string,
  onChange: (text: string) => void,
  onPasteImages: (files: File[]) => void,
  identifier = '',
  onCursor: (line: number) => void = () => {},
): EditorView {
  const bom = initialText.startsWith('\uFEFF') ? '\uFEFF' : ''
  const extensions: Extension[] = [
    EditorState.lineSeparator.of(initialText.includes('\r\n') ? '\r\n' : '\n'),
    history(),
    liveRendering(identifier),
    markdownLanguage(),
    syntaxHighlighting(defaultHighlightStyle),
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) onChange(bom + update.state.sliceDoc())
      if (update.selectionSet || update.docChanged) onCursor(update.state.doc.lineAt(update.state.selection.main.head).number)
    }),
    EditorView.domEventHandlers({
      paste(event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        onPasteImages(files)
        return true
      },
      drop(event, view) {
        if (view.state.readOnly) return false
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault(); onPasteImages(files); return true
      },
    }),
    EditorView.theme({
      '&': { height: '100%', fontSize: 'calc(17px * var(--editor-zoom))' },
      '.cm-scroller': { fontFamily: 'inherit', overflow: 'auto', lineHeight: '1.8' },
      '.cm-content': { minHeight: '100%', padding: '40px 40px 180px', maxWidth: '900px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },
      '.cm-line': { padding: '0' },
      '.cm-gutters': { display: 'none' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '.cm-selectionBackground': { background: 'color-mix(in srgb, var(--accent) 20%, transparent) !important' },
    }),
  ]
  const state = EditorState.create({ doc: initialText.replace(/^\uFEFF/, ''), extensions })
  return new EditorView({ state, parent })
}

export function wrapSelection(view: EditorView, before: string, after = before, placeholder = '文本'): void {
  const selection = view.state.selection.main
  const selected = selection.empty ? placeholder : view.state.sliceDoc(selection.from, selection.to)
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: before + selected + after },
    selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length },
    scrollIntoView: true,
  })
  view.focus()
}

export function insertAtLine(view: EditorView, prefix: string, suffix = ''): void {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const text = line.text.replace(/^(?:#{1,6} |>[ ]?|[-+*] (?:\[[ x]\] )?|\d+\. )/, '')
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: prefix + text + suffix },
    selection: { anchor: line.from + prefix.length, head: line.from + prefix.length + text.length },
    scrollIntoView: true,
  })
  view.focus()
}

export function insertBlock(view: EditorView, source: string): void {
  const selection = view.state.selection.main
  const left = view.state.doc.lineAt(selection.from).from
  const right = view.state.doc.lineAt(selection.to).to
  const current = view.state.sliceDoc(left, right)
  const insert = source + '\n\n'
  view.dispatch({
    changes: { from: left, to: right, insert: current ? insert + current : insert },
    selection: { anchor: left + insert.length },
    scrollIntoView: true,
  })
  view.focus()
}

export function insertText(view: EditorView, text: string): void {
  const selection = view.state.selection.main
  view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length }, scrollIntoView: true })
  view.focus()
}

export function goToLine(view: EditorView, lineNumber: number): void {
  const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)))
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
  view.focus()
}
