import { useEffect, useRef, useState } from 'react'
import { allCommands, commandById, menuGroups, tableCommands, type Command } from './commands'

export function MenuBar({ onCommand }: { onCommand: (id:string)=>void }) {
  const [open,setOpen] = useState<number | null>(null); const host = useRef<HTMLElement>(null)
  useEffect(()=>{
    const outside = (event:MouseEvent)=>{ if(!host.current?.contains(event.target as Node))setOpen(null) }
    const keyboard = (event:KeyboardEvent)=>{ const index=menuGroups.findIndex(g=>g.access.toLowerCase()===event.key.toLowerCase()); if(event.altKey&&!event.ctrlKey&&index>=0){event.preventDefault();setOpen(index)};if(event.key==='Escape')setOpen(null) }
    window.addEventListener('mousedown',outside);window.addEventListener('keydown',keyboard)
    return()=>{window.removeEventListener('mousedown',outside);window.removeEventListener('keydown',keyboard)}
  },[])
  return <nav className="titlebar" aria-label="主菜单" ref={host}><span className="titlebar-name">NoteMd</span><div className="menubar" role="menubar">{menuGroups.map((group,index)=><div className="menu-group" key={group.access}><button role="menuitem" aria-haspopup="menu" aria-expanded={open===index} onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(open===index?null:index)} onMouseEnter={()=>{if(open!==null)setOpen(index)}}>{group.label} ({group.access})</button>{open===index&&<CommandMenu items={group.items} onClose={()=>setOpen(null)} onCommand={id=>{setOpen(null);onCommand(id)}} />}</div>)}</div></nav>
}
export function CommandMenu({items,onCommand,onClose,className='',style}:{items:Command[];onCommand:(id:string)=>void;onClose:()=>void;className?:string;style?:React.CSSProperties}) {
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{ref.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})},[])
  return <div ref={ref} role="menu" className={'command-menu '+className} style={style} onMouseDown={e=>e.preventDefault()} onKeyDown={e=>{ const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()};if(e.key==='Escape'){e.preventDefault();onClose()} }} >{items.map(item=><button role="menuitem" key={item.id} onClick={()=>onCommand(item.id)}><span>{item.label}</span>{item.shortcut&&<kbd>{item.shortcut}</kbd>}</button>)}</div>
}
export function editorContextCommands(kind?:string):Command[]{
  const general=['undo','redo','cut','copy','paste','select-all','bold','italic','underline','strike','highlight','color','heading-1','heading-2','paragraph','ordered-list','bullet-list','task-list','blockquote','table','image','link','codeblock','math-block']
  const node:Command[]=kind==='table'?tableCommands:kind==='image'?[{id:'edit-image',label:'修改图片路径…'},{id:'copy-image',label:'复制图片'},{id:'copy-node',label:'复制图片 Markdown'},{id:'delete-node',label:'删除图片'}]:kind?.includes('math')?[{id:'edit-math',label:'编辑公式…'},{id:'copy-node',label:'复制公式'},{id:'delete-node',label:'删除公式'}]:[]
  return [...node,...general.map(id=>commandById.get(id)!)]
}
export function Shortcuts({onClose}:{onClose:()=>void}){return <div className="modal-backdrop" onKeyDown={e=>{if(e.key==='Escape')onClose()}}><section className="modal shortcuts-modal" role="dialog" aria-label="快捷键速览"><h2>快捷键速览</h2><p>Ctrl+滚轮：正文 / 目录分别缩放 · Tab / Shift+Tab：列表缩进、表格移动 · 双击文档标题：重命名</p><div className="shortcut-grid">{allCommands.filter(c=>c.shortcut).map(c=><div key={c.id}><span>{c.label}</span><kbd>{c.shortcut}</kbd></div>)}</div><div className="modal-actions"><button autoFocus onClick={onClose}>关闭</button></div></section></div>}
