import { useEffect, useState, type JSX } from 'react'
import { Archive, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Folder, FolderOpen, FolderPlus, Plus, RefreshCw, Search, Trash2, Replace } from 'lucide-react'
import type { LibraryEntry, LibraryTreeEntry } from '../../main/files'
import type { Heading } from './markdown'

export function TocPanel({ headings, onSelect, activeLine }: { headings: Heading[]; activeLine: number; onSelect: (line: number) => void }): JSX.Element {
  return <div className="toc-panel"><div className="panel-heading"><span>文档目录</span><span>{headings.length}</span></div>{headings.length ? <nav>{headings.map(h => <button key={h.id + h.line} aria-current={headings.filter(item => item.line <= activeLine).at(-1)?.id === h.id ? 'location' : undefined} style={{ paddingLeft: 10 + (h.level - 1) * 13 }} onClick={() => onSelect(h.line)}><span className="toc-marker" />{h.text}</button>)}</nav> : <div className="empty-panel"><Search size={22} /><p>标题会出现在这里</p><small>使用 # 标题开始组织文档</small></div>}</div>
}

interface FilesProps { folder: string; tree: LibraryTreeEntry[]; active: string; onFolder: (folder: string) => void; onOpen: (item: LibraryEntry) => void; onContext: (event: React.MouseEvent, item: LibraryEntry) => void; onNew: () => void; onNewFolder: () => void; onUp: () => void; onMove: (item: LibraryEntry, destination: string) => Promise<void>; onReorder: (folder: string, names: string[]) => Promise<void> }
export function FilesPanel({ folder, tree, active, onFolder, onOpen, onContext, onNew, onNewFolder, onUp, onMove, onReorder }: FilesProps): JSX.Element {
  const [dragged, setDragged] = useState<LibraryEntry | null>(null)
  const [drop, setDrop] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  useEffect(() => { setExpanded(current => new Set([...current, ...flattenFolders(tree)])) }, [tree])
  const render = (items: LibraryTreeEntry[], depth = 0): JSX.Element[] => items.flatMap(item => {
    const open = expanded.has(item.path), children = item.children ?? []
    const rows: JSX.Element[] = [<button key={item.path} className={'file-row tree-row ' + (active === item.path ? 'selected ' : '') + (folder === item.path ? 'folder-current ' : '') + (drop === item.path ? 'drop-target' : '')} style={{ paddingLeft: 8 + depth * 14 }} draggable title={item.kind === 'folder' ? '单击展开并选为新建位置；拖动整理' : '拖动整理；右键查看更多操作'} onDragStart={e => { setDragged(item); e.dataTransfer.setData('text/plain', item.path); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDragged(null); setDrop('') }} onDragOver={e => { e.preventDefault(); setDrop(item.path) }} onDrop={e => {
      e.preventDefault(); setDrop('')
      if (!dragged || dragged.path === item.path) return
      const rect = e.currentTarget.getBoundingClientRect(); const ratio = (e.clientY - rect.top) / rect.height
      if (item.kind === 'folder' && ratio > .25 && ratio < .75) void onMove(dragged, item.path)
      else {
        const parent = parentPath(item.path); const siblings = parent ? findFolder(tree, parent)?.children ?? [] : tree
        const names = siblings.filter(entry => entry.path !== dragged.path).map(entry => entry.name); const index = names.indexOf(item.name)
        names.splice(index + (ratio > .5 ? 1 : 0), 0, dragged.name); void onReorder(parent, names)
      }
      setDragged(null)
    }} onClick={() => item.kind === 'folder' ? (onFolder(item.path), setExpanded(current => new Set(current).add(item.path))) : onOpen(item)} onContextMenu={e => onContext(e, item)}><span className="tree-toggle" onClick={e => { if (item.kind === 'folder') { e.stopPropagation(); setExpanded(current => { const next = new Set(current); next.has(item.path) ? next.delete(item.path) : next.add(item.path); return next }) } }}>{item.kind === 'folder' ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</span><span className={'file-icon ' + item.kind}>{item.kind === 'folder' ? <Folder size={15} /> : <FileText size={15} />}</span><span className="file-name">{item.name}</span><span className="file-kind">{item.kind === 'folder' ? '目录' : 'MD'}</span></button>]
    if (item.kind === 'folder' && open) rows.push(...render(children, depth + 1))
    return rows
  })
  return <div className="files-panel"><div className="files-toolbar"><button onClick={onNew} title="在选中目录新建文档"><Plus size={15} /></button><button onClick={onNewFolder} title="在选中目录新建文件夹"><FolderPlus size={15} /></button><button onClick={onUp} disabled={!folder} title="选中上一级目录"><ChevronLeft size={15} /></button><span className="toolbar-spacer" /><button onClick={() => onFolder(folder)} title="刷新"><RefreshCw size={14} /></button></div><div className="file-location"><FolderOpen size={14} /><span>{folder || '文档库根目录'}</span></div><nav className="file-list" aria-label="文件库目录树">{render(tree)}{!tree.length && <div className="empty-files"><Archive size={24} /><p>这里还没有文档</p><small>新建一篇笔记开始</small></div>}</nav></div>
}
function flattenFolders(entries: LibraryTreeEntry[]): string[] { return entries.flatMap(e => e.kind === 'folder' ? [e.path, ...flattenFolders(e.children ?? [])] : []) }
function parentPath(path: string): string { return path.split('/').slice(0, -1).join('/') }
function findFolder(entries: LibraryTreeEntry[], path: string): LibraryTreeEntry | undefined { for (const entry of entries) { if (entry.path === path) return entry; const found = findFolder(entry.children ?? [], path); if (found) return found } }

export function FolderPicker({ tree, selected, onSelect }: { tree: LibraryTreeEntry[]; selected: string; onSelect: (path: string) => void }): JSX.Element {
  const render = (items: LibraryTreeEntry[], depth = 0): JSX.Element[] => items.filter(i => i.kind === 'folder').flatMap(item => [<button key={item.path} className={'folder-choice ' + (selected === item.path ? 'selected' : '')} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => onSelect(item.path)}><Folder size={14} />{item.name}{selected === item.path && <Check size={14} />}</button>, ...render(item.children ?? [], depth + 1)])
  return <div className="folder-picker"><button className={'folder-choice ' + (!selected ? 'selected' : '')} onClick={() => onSelect('')}><FolderOpen size={14} />文件库根目录{!selected && <Check size={14} />}</button>{render(tree)}<p>仅可移动到当前文档库内。库外路径不可选，文档不会移动到文档库之外。</p></div>
}

export function ContextMenu({ menu, onClose, onAction }: { menu: { x: number; y: number; item: LibraryEntry }; onClose: () => void; onAction: (action: string) => void }): JSX.Element {
  return <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}><div className="context-title">{menu.item.name}</div>{menu.item.kind === 'file' && <button onClick={() => onAction('assets')}><FolderOpen size={14} />查看图片目录</button>}<button onClick={() => onAction('reveal')}><Search size={14} />在资源管理器中显示</button><button onClick={() => onAction('duplicate')}><FileText size={14} />创建副本</button><button onClick={() => onAction('copy-path')}><FileText size={14} />复制路径</button><button onClick={() => onAction('rename')}><Replace size={14} />重命名</button><button onClick={() => onAction('move')}><Folder size={14} />移动到…</button><button className="danger" onClick={() => onAction('trash')}><Trash2 size={14} />移到回收站</button><button onClick={onClose}>取消</button></div>
}
export function EmptyState({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }): JSX.Element {
  return <div className="empty-state"><div className="empty-orbit"><div className="brand-mark">N</div></div><h1>让想法有迹可循</h1><p>一个保留原始 Markdown 的本地写作空间。</p><div className="empty-actions"><button onClick={onNew}><Plus size={16} />新建文档</button><button onClick={onOpen}><FileText size={16} />打开文档</button></div><small>Ctrl+N 新建 · Ctrl+O 打开 · Ctrl+S 保存</small></div>
}
