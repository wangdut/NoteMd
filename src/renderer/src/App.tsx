import logo from './logo.svg'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { BookOpen, Bold, Braces, Code2, FilePlus2, Heading2, Italic, Library, Link2, List, ListOrdered, ListChecks, Menu, PanelLeft, Save, Search, Sparkles, Table2, X, Undo2, Redo2, Palette } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import type { LibraryEntry } from '../../main/files'
import type { AppState, OpenNote } from './api'
import { createMarkdownEditor, goToLine, insertAtLine, insertBlock, insertText, wrapSelection } from './editor'
import { setEditorMode, type EditorMode } from './rendering'
import { listHeadings, renderMarkdown, words } from './markdown'
import { ContextMenu, EmptyState, FilesPanel, TocPanel } from './panels'
import { DocumentSession } from './session'
import { allCommands, shortcutCommand, commandById } from './commands'
import { MenuBar, CommandMenu, editorContextCommands, Shortcuts } from './menus'
import { EditorDialog, type EditorDialogState } from './dialogs'
import { createTable } from './tables'
import { clearNode, selectedNode, nodeCommand, formatCell, restoreCellRange } from './nodes'
import { markdown } from './markdown'

type MenuState = { x: number; y: number; item: LibraryEntry } | null
type ModalState = { title: string; message?: string; initial?: string; resolve: (value: string | null) => void }
const clamp = (n: number) => Math.min(200, Math.max(70, n))
const baseName = (p: string) => p.split(/[\\/]/).at(-1) ?? p
const isExternal = (p: string) => /^[a-z]:|^\\\\|^\//i.test(p)

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<AppState | null>(null)
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [folder, setFolder] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [revision, setRevision] = useState(0)
  const [content, setContent] = useState('')
  const [cursorLine, setCursorLine] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<EditorMode>('live')
  const [status, setStatus] = useState('准备就绪')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<AppState['theme']>('light')
  const [sidebar, setSidebar] = useState<'toc' | 'files'>('toc')
  const [editorZoom, setEditorZoom] = useState(100)
  const [tocZoom, setTocZoom] = useState(100)
  const [searchText, setSearchText] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [palette, setPalette] = useState(false)
  const [contextMenu, setContextMenu] = useState<MenuState>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [editorDialog,setEditorDialog] = useState<EditorDialogState | null>(null)
  const [showShortcuts,setShowShortcuts] = useState(false)
  const [bodyMenu,setBodyMenu] = useState<{x:number;y:number;kind?:string}|null>(null)
  const [sidebarWidth,setSidebarWidth] = useState(258)
  const widthRef=useRef(258)
  const [drafts, setDrafts] = useState<Array<{ id: string; path: string; updatedAt: number }>>([])
  const editorHost = useRef<HTMLDivElement>(null)
  const sidebarHost = useRef<HTMLElement>(null)
  const editor = useRef<EditorView | null>(null)
  const session = useRef<DocumentSession | null>(null)
  const actionQueue = useRef<Promise<void>>(Promise.resolve())
  const commandRef = useRef<(command: string) => Promise<void>>(async () => {})
  const zoomRef = useRef({ editorZoom, tocZoom })
  const headings = useMemo(() => listHeadings(content), [content])
  const filtered = entries.filter(item => item.name.toLowerCase().includes(searchText.toLowerCase()))
  const activeName = identifier ? baseName(identifier) : '选择一篇文档开始'

  function report(err: unknown) { const message = err instanceof Error ? err.message : String(err); setError(message); setStatus('操作未完成，编辑内容已保留') }
  async function run(action: () => Promise<void>) {
    const task = actionQueue.current.then(async () => {
      setBusy(true)
      try { await action() } catch (err) { report(err) } finally { setBusy(false) }
    })
    actionQueue.current = task
    await task
  }
  async function refresh(parent = folder) { setEntries(await window.noteMd.list(parent)) }
  async function preference(key: string, value: unknown) { setSettings(await window.noteMd.setPreference(key, value)) }
  function ask(title: string, initial?: string, message?: string): Promise<string | null> { return new Promise(resolve => setModal({ title, initial, message, resolve })) }
  async function flush() {
    const current = session.current
    if (!current) return
    await current.save()
    if (session.current === current) { setDirty(current.dirty); setStatus('已保存 · ' + new Date().toLocaleTimeString('zh-CN')); setError('') }
  }
  function adopt(path: string, note: OpenNote, recovered = false) {
    session.current = new DocumentSession(path, note, window.noteMd.saveNote)
    if (recovered) session.current.markRecovered()
    window.activeNotePath = path
    setIdentifier(path); setContent(note.content); setCursorLine(1); setDirty(recovered); setRevision(n => n + 1); setError(''); setStatus(recovered ? '已恢复草稿' : '已打开')
  }
  async function openNote(path: string) {
    await flush()
    const note = isExternal(path) ? await window.noteMd.openExternal(path) : await window.noteMd.openNote(path)
    adopt(path, note)
  }
  async function newNote() { await flush(); const note = await window.noteMd.createNote(folder); adopt(note.path, note); await refresh() }
  async function newFolder() { const name = await ask('新建文件夹', '新文件夹'); if (name) { await window.noteMd.createFolder(folder, name); await refresh() } }
  async function saveAs() {
    const current = session.current; if (!current) return
    const destination = await window.noteMd.chooseSaveFile(baseName(current.identifier))
    if (!destination) return
    const snapshot = current.content
    const note = await window.noteMd.saveAs(current.identifier, destination, snapshot)
    adopt(destination, note); await refresh()
  }
  async function renameCurrent() {
    const current=session.current;if(!current)return
    const name=await ask('重命名文档',baseName(current.identifier));if(!name||name===baseName(current.identifier))return
    await flush();const next=await window.noteMd.renameCurrent(current.identifier,name)
    adopt(next,await (isExternal(next)?window.noteMd.openExternal(next):window.noteMd.openNote(next)));await refresh()
  }
  function resizeSidebar(value:number,save=false){const width=Math.max(180,Math.min(520,Math.round(value)));widthRef.current=width;setSidebarWidth(width);if(save)void preference('sidebarWidth',width).catch(report)}
  function startResize(event:React.PointerEvent<HTMLDivElement>){
    event.preventDefault();const start=event.clientX,width=widthRef.current
    document.body.style.cursor='col-resize';document.body.style.userSelect='none'
    const move=(e:PointerEvent)=>resizeSidebar(width+e.clientX-start)
    const end=(e:PointerEvent)=>{if(e.type==='pointerup')resizeSidebar(width+e.clientX-start);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.body.style.cursor='';document.body.style.userSelect='';resizeSidebar(widthRef.current,true)}
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end)
  }
  async function pasteImages(files: File[]) {
    const current = session.current; const view = editor.current
    if (!current || !view || view.state.readOnly) return
    try {
      const images = await Promise.all(files.map(async file => ({ name: file.name || '粘贴图片.png', mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })))
      const result = await window.noteMd.importImages(current.identifier, current.content, images)
      if (session.current !== current || editor.current !== view) { setStatus('图片已保存，原文档已切换'); return }
      insertText(view, '\n' + result.markdown + '\n'); await flush(); setStatus('图片已保存到文档同级目录')
    } catch (err) { report(err) }
  }
  function format(command: string) {
    const view = editor.current; if (!view || mode === 'read') return
    const wrappers: Record<string, [string, string?, string?]> = { bold: ['**'], italic: ['*'], strike: ['~~'], underline: ['<u>', '</u>'], highlight: ['=='], 'inline-code': ['`', '`', '代码'], link: ['[', '](https://)', '链接文字'], 'math-inline': ['$', '$', 'x^2'], color: ['<span style="color:#d46a45">', '</span>'], superscript: ['^'], subscript: ['~'] }
    if (wrappers[command]) { const [before, after, placeholder] = wrappers[command]; if(!formatCell(view,before!,after))wrapSelection(view, before!, after, placeholder) }
    else if (/^heading-[1-6]$/.test(command)) insertAtLine(view, '#'.repeat(Number(command.at(-1))) + ' ')
    else if (command === 'paragraph') insertAtLine(view, '')
    else if (command === 'blockquote') insertAtLine(view, '> ')
    else if (command === 'bullet-list') insertAtLine(view, '- ')
    else if (command === 'ordered-list') insertAtLine(view, '1. ')
    else if (command === 'task-list') insertAtLine(view, '- [ ] ')
    else if (command === 'codeblock') insertBlock(view, '```text\n代码\n```')
    else if (command === 'math-block') insertBlock(view, '$$\nx^2 + y^2 = z^2\n$$')
    else if (command === 'table') insertBlock(view, '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |')
    else if (command === 'toc') insertBlock(view, '[TOC]')
    else if (command === 'horizontal-rule') insertBlock(view, '---')
  }
  async function execute(command: string) {
    const view=editor.current
    if (command === 'palette') setPalette(true)
    else if (command === 'shortcuts') setShowShortcuts(true)
    else if (command === 'rename-current') await renameCurrent()
    else if (['cut','copy','paste','select-all'].includes(command)) {
      if(!view)return; const node=selectedNode(view)
      if(command==='copy'&&node?.kind==='image'){const token=markdown.lexer(node.source)[0] as any;const image=token?.tokens?.find((t:any)=>t.type==='image');if(image)await window.noteMd.copyImage(identifier,image.href);return}
      if(!restoreCellRange(view))view.focus();await window.noteMd.clipboard(command as 'cut'|'copy'|'paste'|'select-all')
    }
    else if (view && (command === 'copy-node' || command === 'copy-image')) {
      const node=selectedNode(view);if(!node)return
      if(command==='copy-node')await window.noteMd.clipboard('write',node.source)
      else {const token=markdown.lexer(node.source)[0] as any;const image=token?.tokens?.find((t:any)=>t.type==='image');if(image)await window.noteMd.copyImage(identifier,image.href)}
      setStatus('已复制')
    }
    else if (view && (command.startsWith('table-') || command === 'delete-node')) nodeCommand(view,command)
    else if (view && mode !== 'read' && (command === 'edit-math' || command === 'edit-image')) {
      const node=selectedNode(view);if(!node)return
      const replace=(text:string)=>{if(editor.current!==view)return;view.dispatch({changes:{from:node.from,to:node.to,insert:text}});clearNode(view);view.focus()}
      if(command==='edit-math'){const quote=node.source.match(/^([ \t]*(?:>[ \t]*)+)/)?.[0]??'';const clean=node.source.replace(/^[ \t]*(?:>[ \t]*)+/gm,'');const display=clean.trimStart().startsWith('$$');setEditorDialog({type:'math',initial:clean.replace(/^\$\$?\s*|\s*\$\$?$/g,''),apply:value=>{const next=display?'$$\n'+value+'\n$$':'$'+value+'$';replace(quote?next.split('\n').map(line=>quote+line).join('\n'):next)}})}
      else {const token=markdown.lexer(node.source)[0] as any;const image=token?.tokens?.find((t:any)=>t.type==='image');if(image)setEditorDialog({type:'image',initial:image.href,alt:image.text,apply:(value:string,alt?:string)=>replace('!['+(alt??'').replace(/[\[\]]/g,'')+'](<'+value.replace(/[<>\r\n]/g,'')+'>)')})}
    }
    else if (view && mode !== 'read' && command === 'table') setEditorDialog({type:'table',apply:(rows:string,columns?:string)=>{if(editor.current===view)insertBlock(view,createTable(Number(rows),Number(columns)))}})
    else if (command === 'new') await newNote()
    else if (command === 'new-folder') await newFolder()
    else if (command === 'open') { await flush(); const path = await window.noteMd.chooseOpenFile(); if (path) await openNote(path) }
    else if (command === 'save') await flush()
    else if (command === 'save-as') await saveAs()
    else if (command === 'close') { await flush(); window.noteMd.closeReady() }
    else if (command === 'recovery') setDrafts(await window.noteMd.listDrafts())
    else if (command === 'image' && editor.current && session.current && mode !== 'read') {
      const images = await window.noteMd.pickImages()
      if (images.length) { const result = await window.noteMd.importImages(session.current.identifier, session.current.content, images); insertText(editor.current, '\n' + result.markdown + '\n'); await flush() }
    }
    else if (command === 'color' && editor.current && mode !== 'read') {
      const target=editor.current;setEditorDialog({type:'color',apply:color=>{if(editor.current===target&&!formatCell(target,'<span style="color:'+color+'">','</span>'))wrapSelection(target,'<span style="color:'+color+'">','</span>')}})
    }
    else if (command === 'choose-library') {
      await flush(); const next = await window.noteMd.chooseLibrary()
      if (next) { setSettings(next); setFolder(''); setIdentifier(''); session.current = null; setContent(''); setRevision(n => n + 1); await refresh('') }
    } else if (command.startsWith('sidebar-')) { const value = command === 'sidebar-toc' ? 'toc' : 'files'; setSidebar(value); await preference('sidebar', value) }
    else if (command === 'focus') setFocusMode(value => !value)
    else if (command === 'replace' || command === 'find') { if (editor.current) openSearchPanel(editor.current) }
    else if (command === 'undo' || command === 'redo') { if (editor.current && mode !== 'read') { if((document.activeElement as HTMLElement)?.matches('td,th'))(document.activeElement as HTMLElement).blur();(command === 'undo' ? undo : redo)(editor.current);editor.current.focus() } }
    else if (command.startsWith('theme-')) { const value = command.slice(6) as AppState['theme']; setTheme(value); await preference('theme', value) }
    else if (command.startsWith('mode-')) setMode(command.slice(5) as EditorMode)
    else if (command.startsWith('zoom-')) { const next = command === 'zoom-reset' ? 100 : clamp(zoomRef.current.editorZoom + (command === 'zoom-in' ? 10 : -10)); setEditorZoom(next); await preference('editorZoom', next) }
    else if (command === 'export-html' || command === 'export-pdf') { if (session.current) { await flush(); const host = document.createElement('article'); host.innerHTML = renderMarkdown(session.current.content); await Promise.all(Array.from(host.querySelectorAll<HTMLImageElement>('img[data-local-src]')).map(async img => { img.src = await window.noteMd.resolveImage(session.current!.identifier, img.dataset.localSrc!); delete img.dataset.localSrc })); await window.noteMd.exportHtml(activeName, host.innerHTML, command === 'export-pdf' ? 'pdf' : 'html') } }
    else if (command === 'print') { setMode('read'); setTimeout(() => window.print(), 150) }
    else if (command === 'reveal' && session.current) await window.noteMd.reveal(session.current.identifier)
    else if (command === 'about' || command === 'shortcuts') await ask(command === 'about' ? '关于 NoteMd' : '快捷键', undefined, command === 'about' ? 'NoteMd 0.2.0 · MIT 开源。本地文件，实时编辑。部分 Markdown 语法扩展来自 MarkText，详见 THIRD_PARTY_NOTICES.md。' : 'Ctrl+N 新建 · Ctrl+O 打开 · Ctrl+S 保存 · Ctrl+Shift+S 另存为 · Ctrl+F 查找 · Ctrl+H 替换 · Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+滚轮独立缩放正文/目录 · Ctrl+Shift+P 命令面板')
    else format(command)
  }
  commandRef.current = command => {
    const exclusive = ['new','new-folder','open','save-as','close','rename-current','choose-library','export-html','export-pdf']
    return exclusive.includes(command) ? run(() => execute(command)) : execute(command).catch(report)
  }

  async function relocate(item: LibraryEntry, destination: string, rename = false) {
    await flush()
    const changed = rename ? await window.noteMd.rename(item.path, destination) : await window.noteMd.move(item.path, destination)
    const current = session.current?.identifier
    if (current && (current === item.path || current.startsWith(item.path + '/'))) { const next = changed + current.slice(item.path.length); adopt(next, await window.noteMd.openNote(next)) }
    await refresh()
  }
  async function contextAction(action: string, item: LibraryEntry) {
    if (action === 'duplicate') { await flush(); await window.noteMd.duplicate(item.path); await refresh() }
    if (action === 'copy-path') { await window.noteMd.copyPath(item.path); setStatus('路径已复制') }
    if (action === 'rename') { const name = await ask('重命名', item.name); if (name && name !== item.name) await relocate(item, name, true) }
    if (action === 'move') { const destination = await ask('移动到文件库目录', '', '输入相对目录，例如：课程/第一周。留空表示根目录。'); if (destination !== null) await relocate(item, destination) }
    if (action === 'trash') {
      const result = await ask('移到回收站', undefined, '确定将「' + item.name + '」移到系统回收站？图片目录保留，避免影响其他文档。')
      if (result === null) return
      await flush(); await window.noteMd.trash(item.path)
      if (session.current?.identifier === item.path || session.current?.identifier.startsWith(item.path + '/')) { session.current = null; setIdentifier(''); setContent(''); setDirty(false); setRevision(n => n + 1) }
      await refresh()
    }
    if (action === 'reveal') await window.noteMd.reveal(item.path)
    if (action === 'assets') setStatus(await window.noteMd.showAssets(item.path) ? '已打开图片目录' : '文档没有托管的图片目录')
  }

  useEffect(() => {
    void window.noteMd.getState().then(async state => { setSettings(state); setTheme(state.theme); setEditorZoom(state.editorZoom); setTocZoom(state.tocZoom);resizeSidebar(state.sidebarWidth ?? 258); await refresh('') }).catch(report)
    void window.noteMd.listDrafts().then(setDrafts).catch(report)
    const off = window.noteMd.onCommand(command => { void commandRef.current(command) })
    const keyboard = (event: KeyboardEvent) => {
      if(event.isComposing)return
      const target=event.target as HTMLElement;if(target.closest('.modal,.command-bar')||target.matches('input,textarea'))return
      if(event.ctrlKey&&!event.shiftKey&&event.code==='KeyC'&&editor.current&&selectedNode(editor.current)?.kind==='image'){event.preventDefault();event.stopPropagation();void commandRef.current('copy-image');return}
      const command=shortcutCommand(event);if(command){event.preventDefault();event.stopPropagation();void commandRef.current(command)}
    }
    const nodeCommand=(event:Event)=>{void commandRef.current((event as CustomEvent<string>).detail)}
    window.addEventListener('keydown', keyboard,true);window.addEventListener('notemd:editor-command',nodeCommand)
    return () => { off(); window.removeEventListener('keydown', keyboard,true);window.removeEventListener('notemd:editor-command',nodeCommand) }
  }, [])
  useEffect(() => {
    const current = session.current
    if (!current || !editorHost.current) { editor.current?.destroy(); editor.current = null; return }
    const view = createMarkdownEditor(editorHost.current, current.content, text => { current.edit(text); setContent(text); setDirty(current.dirty); setStatus('未保存') }, files => { void pasteImages(files) }, current.identifier, setCursorLine)
    editor.current = view; setEditorMode(view, mode)
    return () => { view.destroy(); if (editor.current === view) editor.current = null }
  }, [revision])
  useEffect(() => { if (editor.current) setEditorMode(editor.current, mode, busy) }, [mode, busy, revision])
  useEffect(() => {
    const current = session.current
    if (!current || !dirty) return
    const timer = setTimeout(() => { void window.noteMd.writeDraft(current.identifier, current.content, current.stamp).catch(report) }, 150)
    return () => clearTimeout(timer)
  }, [content, dirty])
  useEffect(() => {
    if (!dirty || error || busy) return
    const timer = setTimeout(() => { void flush().catch(report) }, 850)
    return () => clearTimeout(timer)
  }, [content, dirty, error, busy])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.setProperty('--editor-zoom', String(editorZoom / 100))
    document.documentElement.style.setProperty('--toc-zoom', String(tocZoom / 100))
    zoomRef.current = { editorZoom, tocZoom }
  }, [theme, editorZoom, tocZoom])
  useEffect(() => {
    const registrations: Array<() => void> = []; let timer: ReturnType<typeof setTimeout>
    for (const [host, key] of [[editorHost.current, 'editorZoom'], [sidebarHost.current, 'tocZoom']] as const) {
      if (!host) continue
      const wheel = (event: WheelEvent) => { if (!event.ctrlKey) return; event.preventDefault(); const next = clamp(zoomRef.current[key] + (event.deltaY < 0 ? 10 : -10)); zoomRef.current[key] = next; (key === 'editorZoom' ? setEditorZoom : setTocZoom)(next); clearTimeout(timer); timer = setTimeout(() => { void preference(key, next).catch(report) }, 200) }
      host.addEventListener('wheel', wheel as EventListener, { passive: false }); registrations.push(() => host.removeEventListener('wheel', wheel as EventListener))
    }
    return () => { registrations.forEach(dispose => dispose()); clearTimeout(timer) }
  }, [focusMode])
  useEffect(() => { const close = () => {setContextMenu(null);setBodyMenu(null)}; window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  return <div className={'app-shell ' + (focusMode ? 'is-focused' : '')} aria-busy={busy}>
    <MenuBar onCommand={id=>void commandRef.current(id)}/>
    <header className="app-header"><div className="brand-lockup"><img className="brand-icon" src={logo} alt="NoteMd" /><div><strong>NoteMd</strong><span>LOCAL / MARKDOWN</span></div></div><div className="document-title" role="button" tabIndex={0} title="双击重命名文档 · F2" onDoubleClick={()=>void commandRef.current('rename-current')} onKeyDown={e=>{if(e.key==='Enter')void commandRef.current('rename-current')}}><i className={dirty ? 'dirty-dot' : 'saved-dot'} />{activeName}{dirty ? ' · 未保存' : ''}</div><div className="header-actions"><button className="icon-button" title="查找正文" onClick={() => void commandRef.current('find')}><Search size={17} /></button><button className="icon-button" title="切换侧栏" onClick={() => setSidebar(value => value === 'toc' ? 'files' : 'toc')}><PanelLeft size={17} /></button><button className="icon-button" title="切换主题" onClick={() => void commandRef.current('theme-' + (theme === 'light' ? 'dark' : theme === 'dark' ? 'paper' : 'light'))}><Sparkles size={17} /></button><button className="save-button" disabled={!identifier || busy} onClick={() => void commandRef.current('save')}><Save size={15} />保存</button></div></header>
    <div className="command-strip"><div className="command-group" onMouseDown={e=>e.preventDefault()}>{([[ 'new', '新建文档', FilePlus2 ], ['undo', '撤销', Undo2], ['redo', '重做', Redo2], ['bold', '加粗', Bold], ['italic', '斜体', Italic], ['heading-2', '标题', Heading2], ['codeblock', '代码块', Code2], ['ordered-list', '有序列表', ListOrdered], ['bullet-list', '无序列表', List], ['color', '字体颜色', Palette], ['task-list', '任务列表', ListChecks], ['table', '表格', Table2], ['link', '链接', Link2]] as const).map(([key, title, Icon]) => <button key={key} title={title+(commandById.get(key)?.shortcut?' · '+commandById.get(key)!.shortcut:'')} onClick={() => void commandRef.current(key)}><Icon size={16} /></button>)}</div><div className="mode-switcher">{([['live', '实时', Code2], ['source', '源码', Braces], ['read', '阅读', BookOpen]] as const).map(([key, label, Icon]) => <button key={key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}><Icon size={14} />{label}</button>)}</div></div>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void commandRef.current('save-as')}>另存副本</button><button onClick={() => void run(async () => { if (await ask('重新加载', undefined, '放弃当前未保存编辑，重新读取磁盘？') !== null && session.current) { const p = session.current.identifier; adopt(p, await (isExternal(p) ? window.noteMd.openExternal(p) : window.noteMd.openNote(p))) } })}>重新加载</button><button aria-label="关闭提示" onClick={() => setError('')}><X size={15} /></button></div>}
    <main className="workspace">{!focusMode && <aside className="sidebar" ref={sidebarHost} style={{width:sidebarWidth}}><div className="sidebar-tabs"><button className={sidebar === 'toc' ? 'active' : ''} onClick={() => setSidebar('toc')}>目录</button><button className={sidebar === 'files' ? 'active' : ''} onClick={() => setSidebar('files')}><Library size={15} />文件库</button></div>{sidebar === 'toc' ? <TocPanel activeLine={cursorLine} headings={headings} onSelect={line => { if (editor.current) goToLine(editor.current, line) }} /> : <><input className="library-search" placeholder="筛选当前目录…" aria-label="筛选文件" value={searchText} onChange={e => setSearchText(e.target.value)} /><FilesPanel folder={folder} entries={filtered} active={identifier} onFolder={p => { setFolder(p); void run(() => refresh(p)) }} onOpen={item => { if (item.kind === 'folder') { setFolder(item.path); void run(() => refresh(item.path)) } else void run(() => openNote(item.path)) }} onContext={(event, item) => { event.preventDefault(); setContextMenu({ x: Math.min(event.clientX, innerWidth - 240), y: Math.min(event.clientY, innerHeight - 370), item }) }} onNew={() => void commandRef.current('new')} onNewFolder={() => void commandRef.current('new-folder')} onUp={() => { const p = folder.split('/').slice(0, -1).join('/'); setFolder(p); void run(() => refresh(p)) }} onMove={(item, destination) => run(() => relocate(item, destination))} onReorder={names => run(async () => { if (searchText) throw new Error('清空筛选后再排序'); await window.noteMd.reorder(folder, names); await refresh() })} /></>}</aside>}
    <div className={focusMode?'sidebar-resizer hidden':'sidebar-resizer'} role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={520} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={startResize} onDoubleClick={()=>resizeSidebar(258,true)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resizeSidebar(sidebarWidth+(e.key==='ArrowLeft'?-10:10),true)}}} />
    {contextMenu && <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onAction={action => { const item = contextMenu.item; setContextMenu(null); void run(() => contextAction(action, item)) }} />}
    <section className="editor-area"><div className="editor-breadcrumb"><span title={settings?.libraryPath}>{settings?.libraryPath ?? 'NoteMd 文档库'}</span><span>{folder}</span><span className="breadcrumb-spacer" /><span className="save-state" title={status} role="status">{busy ? '正在处理…' : status}</span></div><div className={'editor-grid mode-' + mode}><div className="source-pane"><div ref={editorHost} className="editor-host" onContextMenu={event=>{event.preventDefault();setBodyMenu({x:Math.max(4,Math.min(event.clientX,innerWidth-300)),y:Math.max(4,Math.min(event.clientY,innerHeight-560)),kind:editor.current?selectedNode(editor.current)?.kind:undefined})}} /></div>{!identifier && <EmptyState onNew={() => void commandRef.current('new')} onOpen={() => void commandRef.current('open')} />}</div><footer className="status-bar"><span>{words(content)} 字</span><span>{content.split('\n').length} 行</span><span>{editorZoom}%</span><span className="status-spacer" /><span>UTF-8</span><span>Markdown</span></footer></section></main>
    {drafts.length > 0 && <div className="recovery-panel" role="region" aria-label="恢复草稿"><strong>发现未保存的恢复草稿</strong>{drafts.map(d => <button key={d.id} onClick={() => void run(async () => { await flush(); const note = await window.noteMd.recover(d.id); adopt(note.path, note, true); setDrafts(list => list.filter(item => item.id !== d.id)) })}>恢复 {baseName(d.path)}</button>)}<button onClick={() => setDrafts([])}>稍后处理</button></div>}
    <button className="command-palette-trigger" title="命令面板" onClick={() => setPalette(true)}><Menu size={16} /></button>
    {palette && <CommandPalette onClose={() => setPalette(false)} onRun={command => { setPalette(false); void commandRef.current(command) }} />}
    {bodyMenu&&<CommandMenu className="editor-context-menu" style={{left:bodyMenu.x,top:bodyMenu.y}} items={editorContextCommands(bodyMenu.kind)} onClose={()=>setBodyMenu(null)} onCommand={id=>{setBodyMenu(null);void commandRef.current(id)}}/>}
    {showShortcuts&&<Shortcuts onClose={()=>setShowShortcuts(false)}/>}
    {editorDialog&&<EditorDialog state={editorDialog} onClose={()=>setEditorDialog(null)}/>}
    {modal && <Dialog key={modal.title} state={modal} close={value => { modal.resolve(value); setModal(null) }} />}
  </div>
}
function Dialog({ state, close }: { state: ModalState; close: (value: string | null) => void }) {
  const [value, setValue] = useState(state.initial ?? '')
  return <div className="modal-backdrop" onKeyDown={event => { if (event.key === 'Escape') close(null) }}><form className="modal" role="dialog" aria-modal="true" aria-label={state.title} onSubmit={event => { event.preventDefault(); close(value) }}><h2>{state.title}</h2>{state.message && <p>{state.message}</p>}{state.initial !== undefined && <input autoFocus aria-label={state.title} value={value} onFocus={event => event.target.select()} onChange={event => setValue(event.target.value)} />}<div className="modal-actions"><button type="button" onClick={() => close(null)}>取消</button><button className="primary" autoFocus={state.initial === undefined} type="submit">确定</button></div></form></div>
}
function CommandPalette({ onClose, onRun }: { onClose: () => void; onRun: (command: string) => void }) {
  const [query, setQuery] = useState('')
  return <div className="command-backdrop" onClick={onClose} onKeyDown={event => { if (event.key === 'Escape') onClose() }}><div className="command-bar" role="dialog" aria-label="命令面板" onClick={event => event.stopPropagation()}><div className="command-input"><Search size={18} /><input autoFocus placeholder="输入命令…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="command-results">{allCommands.filter(c=>c.label.includes(query)).map(({id:key,label,shortcut}) => <button key={key} onClick={() => onRun(key!)}><span>{label}</span><kbd>{shortcut}</kbd></button>)}</div></div></div>
}
