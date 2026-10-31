import { EditorView, WidgetType } from '@codemirror/view'
import { renderMarkdown, resolveImages } from './markdown'
import { changeTable, parseTable, serializeTable, serializeCell } from './tables'
export interface NodeSelection { kind: string; from: number; to: number; source: string; row?: number; column?: number }
const selectedNodes = new WeakMap<EditorView, NodeSelection>()
const cellRanges = new WeakMap<EditorView, { cell:HTMLTableCellElement; range:Range }>()
export function rememberCellRange(view:EditorView){
  const selection=window.getSelection();if(!selection?.rangeCount)return
  const range=selection.getRangeAt(0);const element=range.commonAncestorContainer instanceof HTMLElement?range.commonAncestorContainer:range.commonAncestorContainer.parentElement
  const cell=element?.closest<HTMLTableCellElement>('.node-table td,.node-table th');if(cell)cellRanges.set(view,{cell,range:range.cloneRange()})
}
export function restoreCellRange(view:EditorView):boolean{
  const saved=cellRanges.get(view);if(!saved?.cell.isConnected||!selectedNode(view)||selectedNode(view)?.kind!=='table')return false
  saved.cell.focus();const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(saved.range);return true
}
export function formatCell(view:EditorView,before:string,after=before):boolean{
  const node=selectedNode(view);if(node?.kind!=='table')return false
  const data=parseTable(node.source),row=node.row??1,col=node.column??0;const text=data.rows[row]?.[col];if(text===undefined)return true
  const saved=cellRanges.get(view);let start=0,end=text.length
  if(saved?.cell.isConnected&&!saved.range.collapsed){const prefix=saved.range.cloneRange();prefix.selectNodeContents(saved.cell);prefix.setEnd(saved.range.startContainer,saved.range.startOffset);const selected=saved.range.toString();const at=text.indexOf(selected,prefix.toString().length);if(at>=0){start=at;end=at+selected.length}}
  data.rows[row]![col]=text.slice(0,start)+before+text.slice(start,end)+after+text.slice(end)
  const source=serializeTable(data);(document.activeElement as HTMLElement)?.blur();view.dispatch({changes:{from:node.from,to:node.to,insert:source}});selectedNodes.set(view,{...node,source,to:node.from+source.length});return true
}
export function selectedNode(view: EditorView): NodeSelection | undefined {
  const node = selectedNodes.get(view)
  return node && node.from>=0 && node.to<=view.state.doc.length && view.state.sliceDoc(node.from, node.to).replaceAll('\r\n', '\n') === node.source ? node : undefined
}
export function clearNode(view: EditorView) { selectedNodes.delete(view); view.dom.querySelectorAll('.node-selected').forEach(n => n.classList.remove('node-selected')) }
export function nodeCommand(view: EditorView, command: string): boolean {
  const node = selectedNode(view); if (!node || view.state.readOnly) return false
  if (command === 'delete-node') { view.dispatch({ changes: { from: node.from, to: node.to, insert: '' }, selection: { anchor: node.from } }); clearNode(view); view.focus(); return true }
  if (node.kind === 'table' && command.startsWith('table-')) {
    const source = changeTable(node.source, command.slice(6), node.row ?? 1, node.column ?? 0)
    ;(document.activeElement as HTMLElement)?.blur()
    view.dispatch({ changes: { from: node.from, to: node.to, insert: source } })
    selectedNodes.set(view, { ...node, source, to: node.from + source.length }); return true
  }
  return false
}
function requestCommand(view: EditorView, command: string) { view.dom.dispatchEvent(new CustomEvent('notemd:editor-command', { bubbles: true, detail: command })) }
function select(view: EditorView, node: HTMLElement, data: NodeSelection, focus = true) {
  clearNode(view); selectedNodes.set(view, data); node.classList.add('node-selected')
  if (focus) { view.dispatch({ selection: { anchor: data.from, head: data.to } }); view.focus() }
}
export class PreviewWidget extends WidgetType {
  constructor(readonly source: string, readonly from: number, readonly identifier: string, readonly kind: string, readonly readOnly = false, readonly allSource = source) { super() }
  eq(other: PreviewWidget) { return this.source === other.source && this.identifier === other.identifier && this.kind === other.kind && this.readOnly === other.readOnly }
  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement(this.kind === 'inline-math' || this.kind === 'image' ? 'span' : 'div')
    node.className = 'live-block markdown-body preview-node node-' + this.kind
    node.dataset.kind = this.kind; node.dataset.from = String(this.from); node.dataset.source = this.source
    const body = document.createElement('span'); body.className = 'node-body'; body.innerHTML = renderMarkdown(this.kind==='math'?this.source.replace(/^\s*(?:>\s*)+/gm,''):this.source, this.allSource)
    body.querySelectorAll<HTMLElement>('.katex-error').forEach(error=>{error.textContent='公式语法有误';error.title='点击选中后使用“编辑公式”查看并修正 LaTeX';error.removeAttribute('style');error.classList.add('formula-error')})
    if (this.kind === 'image' || this.kind === 'inline-math') { const p = body.firstElementChild; if (p?.tagName === 'P') p.replaceWith(...p.childNodes) }
    node.append(body); resolveImages(node, this.identifier)
    if (!this.readOnly) {
      const tools = document.createElement('span'); tools.className = 'node-tools'; tools.contentEditable = 'false'
      const commands = this.kind === 'image' ? [['edit-image', '图片路径'], ['copy-image', '复制图片'], ['copy-node', '复制 Markdown'], ['delete-node', '删除图片']] : this.kind.includes('math') ? [['edit-math', '编辑公式'], ['copy-node', '复制公式'], ['delete-node', '删除公式']] : this.kind === 'table' ? [['table-row-before','上方插行'], ['table-row-after','下方插行'], ['table-column-before','左侧插列'], ['table-column-after','右侧插列']] : []
      if (this.kind === 'image') { const img = body.querySelector('img'); const label = document.createElement('span'); label.className = 'image-path'; label.textContent = img?.dataset.localSrc ?? img?.getAttribute('src') ?? ''; label.title = label.textContent; tools.append(label) }
      for (const [command, title] of commands) { const button = document.createElement('button'); button.type = 'button'; button.textContent = title!; button.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() }); button.addEventListener('click', e => { e.stopPropagation(); requestCommand(view, command!) }); tools.append(button) }
      node.append(tools)
    }
    node.addEventListener('mousedown', event => {
      const target = event.target as HTMLElement
      if (target.closest('.node-tools')) return
      const link = target.closest('a'); if (link) { event.preventDefault(); const line = Number(link.dataset.line); if (line) view.dispatch({ selection: { anchor: view.state.doc.line(Math.min(line, view.state.doc.lines)).from }, scrollIntoView: true }); else { const href = link.getAttribute('href'); if (href && /^(https?:|mailto:)/.test(href)) void window.noteMd.openLink(href) } return }
      if (this.readOnly || view.state.readOnly) return
      const cell = target.closest<HTMLTableCellElement>('td,th'); const source = node.dataset.source!; const from = Number(node.dataset.from)
      const data = { kind: this.kind, from, to: from + source.length, source, row: cell?.parentElement ? (cell.parentElement as HTMLTableRowElement).rowIndex : undefined, column: cell?.cellIndex }
      if (!cell) event.preventDefault()
      select(view, node, data, !cell)
    })
    if (this.kind === 'table' && !this.readOnly) this.attachCells(view, node)
    return node
  }
  updateDOM(node: HTMLElement): boolean {
    if (this.kind !== 'table' || !node.contains(document.activeElement) || !(document.activeElement as HTMLElement)?.matches('td,th')) return false
    node.dataset.source = this.source; node.dataset.from = String(this.from); return true
  }
  private attachCells(view: EditorView, node: HTMLElement) {
    node.querySelectorAll<HTMLTableCellElement>('td,th').forEach(cell => {
      cell.querySelectorAll<HTMLElement>('.katex').forEach(math=>{const tex=math.querySelector('annotation')?.textContent;if(tex){math.dataset.markdown='$'+tex+'$';math.contentEditable='false'}})
      cell.contentEditable = 'true'; cell.tabIndex = 0; cell.setAttribute('role', 'textbox'); cell.setAttribute('aria-label', '表格 第' + ((cell.parentElement as HTMLTableRowElement).rowIndex + 1) + '行 第' + (cell.cellIndex + 1) + '列')
      cell.addEventListener('focus', () => { const source = node.dataset.source!; const from = Number(node.dataset.from); select(view, node, { kind: 'table', source, from, to: from + source.length, row: (cell.parentElement as HTMLTableRowElement).rowIndex, column: cell.cellIndex }, false) })
      cell.addEventListener('input', () => {
        if (view.state.readOnly) return
        const source = node.dataset.source!; const from = Number(node.dataset.from); const data = parseTable(source); const row = (cell.parentElement as HTMLTableRowElement).rowIndex
        data.rows[row]![cell.cellIndex] = serializeCell(cell)
        const next = serializeTable(data); node.dataset.source = next
        view.dispatch({ changes: { from, to: from + source.length, insert: next }, userEvent: 'input' })
        selectedNodes.set(view, { kind: 'table', from, to: from + next.length, source: next, row, column: cell.cellIndex })
      })
      cell.addEventListener('keyup',()=>rememberCellRange(view));cell.addEventListener('mouseup',()=>rememberCellRange(view));cell.addEventListener('contextmenu',()=>rememberCellRange(view))
      cell.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) { event.preventDefault(); cell.blur(); requestCommand(view, event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return }
        if (event.key !== 'Tab' && event.key !== 'Enter') return
        event.preventDefault(); const cells = [...node.querySelectorAll<HTMLElement>('td,th')]; const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)]
        if (next) next.focus(); else if (!event.shiftKey) { cell.blur(); nodeCommand(view, 'table-row-after'); requestAnimationFrame(() => { const table = view.dom.querySelector<HTMLElement>('.node-table[data-from="' + node.dataset.from + '"]'); table?.querySelector<HTMLElement>('tr:last-child td')?.focus() }) }
      })
      cell.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '') })
    })
  }
  ignoreEvent(): boolean { return true }
}
export class MarkerWidget extends WidgetType {
  constructor(readonly label: string, readonly from: number, readonly checked?: boolean) { super() }
  eq(other: MarkerWidget) { return this.label === other.label && this.from === other.from && this.checked === other.checked }
  toDOM(view: EditorView) {
    const node = document.createElement('span'); node.className = 'list-marker'
    if (this.checked !== undefined) { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.checked; input.disabled = view.state.readOnly; input.addEventListener('mousedown', event => event.preventDefault()); input.addEventListener('click', event => { event.preventDefault(); if (!view.state.readOnly) view.dispatch({ changes: { from: this.from, to: this.from + 1, insert: this.checked ? ' ' : 'x' } }) }); node.append(input) } else node.textContent = this.label
    return node
  }
  ignoreEvent() { return true }
}
