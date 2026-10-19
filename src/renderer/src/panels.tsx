import { useState, type JSX } from 'react'
import { Archive, ChevronLeft, FileText, Folder, FolderOpen, FolderPlus, Plus, RefreshCw, Search, Trash2, Replace } from 'lucide-react'
import type { LibraryEntry } from '../../main/files'
import type { Heading } from './markdown'
export function TocPanel({ headings, onSelect }: { headings: Heading[]; onSelect: (line: number) => void }): JSX.Element {
  return <div className="toc-panel"><div className="panel-heading"><span>文档目录</span><span>{headings.length}</span></div>{headings.length ? <nav>{headings.map(h => <button key={h.id + h.line} style={{ paddingLeft: 10 + (h.level - 1) * 13 }} onClick={() => onSelect(h.line)}><span className="toc-marker" />{h.text}</button>)}</nav> : <div className="empty-panel"><Search size={22} /><p>标题会出现在这里</p><small>使用 # 标题开始组织文档</small></div>}</div>
}
interface FilesProps { folder: string; entries: LibraryEntry[]; active: string; onFolder: (folder: string) => void; onOpen: (item: LibraryEntry) => void; onContext: (event: React.MouseEvent, item: LibraryEntry) => void; onNew: () => void; onNewFolder: () => void; onUp: () => void; onMove: (item: LibraryEntry, destination: string) => Promise<void>; onReorder: (names: string[]) => Promise<void> }
export function FilesPanel({ folder, entries, active, onFolder, onOpen, onContext, onNew, onNewFolder, onUp, onMove, onReorder }: FilesProps): JSX.Element {
  const [dragged, setDragged] = useState<LibraryEntry | null>(null)
  const [drop, setDrop] = useState('')
  return <div className="files-panel"><div className="files-toolbar"><button onClick={onNew} title="新建文档"><Plus size={15} /></button><button onClick={onNewFolder} title="新建文件夹"><FolderPlus size={15} /></button><button onClick={onUp} disabled={!folder} title="返回上一级" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged && folder) void onMove(dragged, folder.split('/').slice(0, -1).join('/')) }}><ChevronLeft size={15} /></button><span className="toolbar-spacer" /><button onClick={() => onFolder(folder)} title="刷新"><RefreshCw size={14} /></button></div><div className="file-location"><FolderOpen size={14} /><span>{folder || '文档库根目录'}</span></div><nav className="file-list">{entries.map(item => <button key={item.path} className={'file-row ' + (active === item.path ? 'selected ' : '') + (drop === item.path ? 'drop-target' : '')} draggable title="拖到条目边缘排序；拖到文件夹中央移入" onDragStart={e => { setDragged(item); e.dataTransfer.setData('text/plain', item.path); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDragged(null); setDrop('') }} onDragOver={e => { e.preventDefault(); setDrop(item.path) }} onDrop={e => {
    e.preventDefault(); setDrop('')
    if (!dragged || dragged.path === item.path) return
    const rect = e.currentTarget.getBoundingClientRect(); const ratio = (e.clientY - rect.top) / rect.height
    if (item.kind === 'folder' && ratio > .25 && ratio < .75) void onMove(dragged, item.path)
    else { const names = entries.filter(entry => entry.path !== dragged.path).map(entry => entry.name); const index = names.indexOf(item.name); names.splice(index + (ratio > .5 ? 1 : 0), 0, dragged.name); void onReorder(names) }
    setDragged(null)
  }} onClick={() => onOpen(item)} onContextMenu={e => onContext(e, item)}><span className={'file-icon ' + item.kind}>{item.kind === 'folder' ? <Folder size={15} /> : <FileText size={15} />}</span><span className="file-name">{item.name}</span><span className="file-kind">{item.kind === 'folder' ? '目录' : 'MD'}</span></button>)}{!entries.length && <div className="empty-files"><Archive size={24} /><p>这里还没有文档</p><small>新建一篇笔记开始</small></div>}</nav></div>
}
export function ContextMenu({ menu, onClose, onAction }: { menu: { x: number; y: number; item: LibraryEntry }; onClose: () => void; onAction: (action: string) => void }): JSX.Element {
  return <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}><div className="context-title">{menu.item.name}</div>{menu.item.kind === 'file' && <button onClick={() => onAction('assets')}><FolderOpen size={14} />查看图片目录</button>}<button onClick={() => onAction('reveal')}><Search size={14} />在资源管理器中显示</button><button onClick={() => onAction('rename')}><Replace size={14} />重命名</button><button onClick={() => onAction('move')}><Folder size={14} />移动到…</button><button className="danger" onClick={() => onAction('trash')}><Trash2 size={14} />移到回收站</button><button onClick={onClose}>取消</button></div>
}
export function EmptyState({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }): JSX.Element {
  return <div className="empty-state"><div className="empty-orbit"><div className="brand-mark">N</div></div><h1>让想法有迹可循</h1><p>一个保留原始 Markdown 的本地写作空间。</p><div className="empty-actions"><button onClick={onNew}><Plus size={16} />新建文档</button><button onClick={onOpen}><FileText size={16} />打开文档</button></div><small>Ctrl+N 新建 · Ctrl+O 打开 · Ctrl+S 保存</small></div>
}
