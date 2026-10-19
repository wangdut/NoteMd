export interface Command { id: string; label: string; shortcut?: string; code?: string; shift?: boolean }
export interface CommandGroup { label: string; access: string; items: Command[] }
const c = (id: string, label: string, shortcut?: string, code?: string, shift = false): Command => ({ id, label, shortcut, code, shift })
export const menuGroups: CommandGroup[] = [
  { label: '文件', access: 'F', items: [c('new','新建文档','Ctrl+N','KeyN'),c('new-folder','新建文件夹'),c('open','打开文档…','Ctrl+O','KeyO'),c('rename-current','重命名文档…','F2'),c('save','保存','Ctrl+S','KeyS'),c('save-as','另存为…','Ctrl+Shift+S','KeyS',true),c('choose-library','选择文件库位置…'),c('recovery','恢复未保存草稿'),c('export-html','导出 HTML…'),c('export-pdf','导出 PDF…'),c('print','打印…','Ctrl+P','KeyP'),c('reveal','在资源管理器中显示'),c('close','退出 NoteMd','Alt+F4')] },
  { label: '编辑', access: 'E', items: [c('undo','撤销','Ctrl+Z','KeyZ'),c('redo','重做','Ctrl+Y','KeyY'),c('cut','剪切','Ctrl+X'),c('copy','复制','Ctrl+C'),c('paste','粘贴','Ctrl+V'),c('select-all','全选','Ctrl+A'),c('find','查找','Ctrl+F','KeyF'),c('replace','查找与替换','Ctrl+H','KeyH')] },
  { label: '段落', access: 'P', items: [...[1,2,3,4,5,6].map(n=>c('heading-'+n,'标题 '+n,'Ctrl+'+n,'Digit'+n)),c('paragraph','正文','Ctrl+0','Digit0'),c('blockquote','引用','Ctrl+Shift+Q','KeyQ',true),c('codeblock','代码块','Ctrl+Shift+C','KeyC',true),c('ordered-list','有序列表','Ctrl+Shift+7','Digit7',true),c('bullet-list','无序列表','Ctrl+Shift+8','Digit8',true),c('task-list','任务列表','Ctrl+Shift+9','Digit9',true),c('table','插入表格…','Ctrl+T','KeyT'),c('toc','插入内容目录'),c('horizontal-rule','分隔线')] },
  { label: '格式', access: 'O', items: [c('bold','加粗','Ctrl+B','KeyB'),c('italic','斜体','Ctrl+I','KeyI'),c('underline','下划线','Ctrl+U','KeyU'),c('strike','删除线','Alt+Shift+5'),c('highlight','高亮'),c('color','字体颜色…'),c('inline-code','行内代码','Ctrl+Shift+M','KeyM',true),c('link','超链接','Ctrl+K','KeyK'),c('image','插入图片…','Ctrl+Shift+I','KeyI',true),c('math-block','公式块','Ctrl+Shift+K','KeyK',true),c('math-inline','行内公式'),c('superscript','上标'),c('subscript','下标')] },
  { label: '视图', access: 'V', items: [c('sidebar-toc','文档目录'),c('sidebar-files','文件库'),c('focus','专注模式','F8'),c('mode-live','实时编辑'),c('mode-source','源码模式','Ctrl+/','Slash'),c('mode-read','阅读模式'),c('zoom-in','放大正文','Ctrl+=','Equal'),c('zoom-out','缩小正文','Ctrl+-','Minus'),c('zoom-reset','重置正文缩放'),c('palette','命令面板','Ctrl+Shift+P','KeyP',true)] },
  { label: '主题', access: 'T', items: [c('theme-light','浅色'),c('theme-dark','深色'),c('theme-paper','暖纸')] },
  { label: '帮助', access: 'H', items: [c('shortcuts','快捷键速览','F1'),c('about','关于 NoteMd')] },
]
export const allCommands = menuGroups.flatMap(g=>g.items)
export const commandById = new Map(allCommands.map(c=>[c.id,c]))
export function shortcutCommand(event: KeyboardEvent): string | undefined {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return ({ F1:'shortcuts',F2:'rename-current',F8:'focus' } as Record<string,string>)[event.key]
  if (event.altKey && event.shiftKey && event.code === 'Digit5') return 'strike'
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (event.shiftKey && event.code === 'KeyZ') return 'redo'
  return allCommands.find(c=>c.code === event.code && !!c.shift === event.shiftKey)?.id
}
export const tableCommands = [c('table-row-before','上方插入行'),c('table-row-after','下方插入行'),c('table-column-before','左侧插入列'),c('table-column-after','右侧插入列'),c('table-row-delete','删除当前行'),c('table-column-delete','删除当前列'),c('table-align-left','列左对齐'),c('table-align-center','列居中'),c('table-align-right','列右对齐'),c('delete-node','删除表格')]
