import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyNote, libraryItemPath, managedAssetFolders, createNote, createFolder, importImages, listLibrary, moveEntry, readNote, renameEntry, reorderEntries, resolveImageDataUrl, saveNote } from './files.js'

if (process.env.NOTEMD_USER_DATA) app.setPath('userData', path.resolve(process.env.NOTEMD_USER_DATA))
const here = path.dirname(fileURLToPath(import.meta.url))
const windows = new Set<BrowserWindow>()
const approvedExternal = new Set<string>()
const approvedSaveStamps = new Map<string, { hash: string; exists: boolean }>()
interface Preferences { libraryPath: string; theme: 'light' | 'dark' | 'paper'; editorZoom: number; tocZoom: number; sidebar: 'toc' | 'files' }
const defaults = (): Preferences => ({ libraryPath: process.env.NOTEMD_LIBRARY_PATH || path.join(app.getPath('documents'), 'NoteMd'), theme: 'light', editorZoom: 100, tocZoom: 100, sidebar: 'toc' })

async function preferences(): Promise<Preferences> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
    return { ...defaults(), ...value }
  } catch { return defaults() }
}
async function updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const next = { ...(await preferences()), ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(next, null, 2), 'utf8')
  return next
}
const activeWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? [...windows].at(-1)
const sendCommand = (command: string): void => activeWindow()?.webContents.send('notemd:command', command)

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: '文件(&F)', submenu: [
      { label: '新建文档', accelerator: 'Ctrl+N', click: () => sendCommand('new') },
      { label: '新建文件夹', click: () => sendCommand('new-folder') }, { type: 'separator' },
      { label: '打开文档…', accelerator: 'Ctrl+O', click: () => sendCommand('open') },
      { label: '保存', accelerator: 'Ctrl+S', click: () => sendCommand('save') },
      { label: '另存为…', accelerator: 'Ctrl+Shift+S', click: () => sendCommand('save-as') },
      { type: 'separator' }, { label: '导出为 HTML…', click: () => sendCommand('export-html') },
      { label: '打印…', accelerator: 'Ctrl+P', click: () => sendCommand('print') },
      { label: '在资源管理器中显示', click: () => sendCommand('reveal') }, { type: 'separator' },
      { label: '退出 NoteMd', role: 'quit' },
    ] },
    { label: '编辑(&E)', submenu: [
      { label: '撤销', accelerator: 'Ctrl+Z', click: () => sendCommand('undo') }, { label: '重做', accelerator: 'Ctrl+Y', click: () => sendCommand('redo') }, { type: 'separator' },
      { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' }, { type: 'separator' }, { label: '查找与替换', accelerator: 'Ctrl+H', click: () => sendCommand('replace') },
    ] },
    { label: '段落(&P)', submenu: [
      { label: '标题 1', accelerator: 'Ctrl+1', click: () => sendCommand('heading-1') },
      { label: '标题 2', accelerator: 'Ctrl+2', click: () => sendCommand('heading-2') },
      { label: '标题 3', accelerator: 'Ctrl+3', click: () => sendCommand('heading-3') },
      ...[4, 5, 6].map(n => ({ label: '标题 ' + n, click: () => sendCommand('heading-' + n) })),
      { label: '正文', accelerator: 'Ctrl+0', click: () => sendCommand('paragraph') },
      { label: '引用', accelerator: 'Ctrl+Shift+Q', click: () => sendCommand('blockquote') },
      { label: '代码块', accelerator: 'Ctrl+Shift+C', click: () => sendCommand('codeblock') },
      { label: '无序列表', accelerator: 'Ctrl+Shift+8', click: () => sendCommand('bullet-list') },
      { label: '有序列表', accelerator: 'Ctrl+Shift+7', click: () => sendCommand('ordered-list') },
      { label: '任务列表', click: () => sendCommand('task-list') }, { label: '插入表格', click: () => sendCommand('table') },
      { label: '插入内容目录', click: () => sendCommand('toc') },
    ] },
    { label: '格式(&O)', submenu: [
      { label: '加粗', accelerator: 'Ctrl+B', click: () => sendCommand('bold') }, { label: '斜体', accelerator: 'Ctrl+I', click: () => sendCommand('italic') },
      { label: '行内代码', accelerator: 'Ctrl+Shift+M', click: () => sendCommand('inline-code') }, { label: '超链接', accelerator: 'Ctrl+K', click: () => sendCommand('link') },
      ...Object.entries({ underline: '下划线', strike: '删除线', highlight: '高亮', color: '字体颜色', superscript: '上标', subscript: '下标' }).map(([key, label]) => ({ label, click: () => sendCommand(key) })),
      { label: '公式块', click: () => sendCommand('math-block') }, { label: '行内公式', click: () => sendCommand('math-inline') },
    ] },
    { label: '视图(&V)', submenu: [
      { label: '目录侧栏', click: () => sendCommand('sidebar-toc') }, { label: '文件库侧栏', click: () => sendCommand('sidebar-files') },
      { label: '专注模式', click: () => sendCommand('focus') }, { type: 'separator' },
      { label: '实时渲染', click: () => sendCommand('mode-live') }, { label: '源代码', click: () => sendCommand('mode-source') },
      { label: '阅读模式', click: () => sendCommand('mode-read') }, { type: 'separator' },
      { label: '放大正文', accelerator: 'Ctrl+=', click: () => sendCommand('zoom-in') },
      { label: '缩小正文', accelerator: 'Ctrl+-', click: () => sendCommand('zoom-out') }, { label: '重置正文缩放', click: () => sendCommand('zoom-reset') },
    ] },
    { label: '主题(&T)', submenu: [
      { label: '浅色', click: () => sendCommand('theme-light') }, { label: '深色', click: () => sendCommand('theme-dark') }, { label: '暖纸', click: () => sendCommand('theme-paper') },
    ] },
    { label: '帮助(&H)', submenu: [
      { label: '选择文档库位置…', click: () => sendCommand('choose-library') }, { label: '快捷键速览', click: () => sendCommand('shortcuts') },
      { label: '关于 NoteMd', click: () => sendCommand('about') },
    ] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function approvedNote(identifier: string): Promise<{ root: string; relative: string }> {
  if (path.isAbsolute(identifier)) {
    const absolute = path.resolve(identifier)
    if (!approvedExternal.has(absolute)) throw new Error('Open this Markdown file with the document picker first.')
    return { root: path.dirname(absolute), relative: path.basename(absolute) }
  }
  return { root: (await preferences()).libraryPath, relative: identifier }
}

function setupIpc(): void {
  ipcMain.handle('notemd:open-link', async (_event, url: string) => { if (!/^(https?:|mailto:)/i.test(url)) throw new Error('不支持的链接'); await shell.openExternal(url) })
  ipcMain.handle('notemd:state', async () => {
    const state = await preferences()
    await fs.mkdir(state.libraryPath, { recursive: true })
    return state
  })
  ipcMain.handle('notemd:preference', async (_event, key: keyof Preferences, value: unknown) => {
    if (key === 'theme' && !['light', 'dark', 'paper'].includes(String(value))) throw new Error('Unknown theme.')
    if ((key === 'editorZoom' || key === 'tocZoom') && (typeof value !== 'number' || !Number.isFinite(value) || value < 70 || value > 200)) throw new Error('Zoom must be between 70% and 200%.')
    if (key === 'sidebar' && !['toc', 'files'].includes(String(value))) throw new Error('Unknown sidebar.')
    if (!['theme', 'editorZoom', 'tocZoom', 'sidebar'].includes(key)) throw new Error('Unsupported preference.')
    return updatePreferences({ [key]: value })
  })
  ipcMain.handle('notemd:choose-library', async () => {
    const current = await preferences()
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], defaultPath: current.libraryPath, title: '选择 NoteMd 文档库' })
    if (result.canceled || !result.filePaths[0]) return null
    const libraryPath = path.resolve(result.filePaths[0])
    await fs.mkdir(libraryPath, { recursive: true })
    return updatePreferences({ libraryPath })
  })
  ipcMain.handle('notemd:open-file', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const absolute = path.resolve(result.filePaths[0])
    approvedExternal.add(absolute)
    return absolute
  })
  ipcMain.handle('notemd:save-file', async (_event, suggestedName: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: suggestedName, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (result.canceled || !result.filePath) return null
    const absolute = path.resolve(result.filePath)
    approvedExternal.add(absolute)
    const stamp = await readNote(path.dirname(absolute), path.basename(absolute)).then(note => note.stamp, error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return { hash: '', exists: false } })
    approvedSaveStamps.set(absolute, stamp)
    return absolute
  })
  ipcMain.handle('notemd:save-as', async (_event, source: string, destination: string, content: string) => {
    const from = await approvedNote(source)
    const to = await approvedNote(destination)
    const expected = approvedSaveStamps.get(path.resolve(destination))
    if (!expected) throw new Error('请通过另存为对话框选择目标。')
    const result = await copyNote(from.root, from.relative, to.root, to.relative, content, expected)
    approvedSaveStamps.delete(path.resolve(destination))
    return result
  })
  ipcMain.handle('notemd:list', async (_event, folder: string) => listLibrary((await preferences()).libraryPath, folder))
  ipcMain.handle('notemd:create-note', async (_event, folder: string) => createNote((await preferences()).libraryPath, folder))
  ipcMain.handle('notemd:read-note', async (_event, relative: string) => readNote((await preferences()).libraryPath, relative))
  ipcMain.handle('notemd:read-external', async (_event, absolute: string) => {
    const doc = await approvedNote(absolute)
    return readNote(doc.root, doc.relative)
  })
  ipcMain.handle('notemd:save-note', async (_event, identifier: string, content: string, stamp: { hash: string; exists: boolean }) => {
    const doc = await approvedNote(identifier)
    return saveNote(doc.root, doc.relative, content, stamp)
  })
  ipcMain.handle('notemd:create-folder', async (_event, folder: string, name: string) => createFolder((await preferences()).libraryPath, folder, name))
  ipcMain.handle('notemd:import-images', async (_event, identifier: string, content: string, images: Array<{ name: string; mimeType: string; bytes: Uint8Array }>) => {
    const doc = await approvedNote(identifier)
    return importImages(doc.root, doc.relative, content, images)
  })
  ipcMain.handle('notemd:rename', async (_event, relative: string, name: string) => renameEntry((await preferences()).libraryPath, relative, name))
  ipcMain.handle('notemd:move', async (_event, relative: string, destination: string) => moveEntry((await preferences()).libraryPath, relative, destination))
  ipcMain.handle('notemd:reorder', async (_event, folder: string, names: string[]) => reorderEntries((await preferences()).libraryPath, folder, names))
  ipcMain.handle('notemd:trash', async (_event, relative: string) => {
    const target = await libraryItemPath((await preferences()).libraryPath, relative)
    await shell.trashItem(target)
  })
  ipcMain.handle('notemd:reveal', async (_event, identifier: string) => {
    const doc = await approvedNote(identifier)
    shell.showItemInFolder(await libraryItemPath(doc.root, doc.relative))
  })
  ipcMain.handle('notemd:show-assets', async (_event, identifier: string) => {
    const doc = await approvedNote(identifier)
    const folders = await managedAssetFolders(doc.root, doc.relative)
    for (const folder of folders) await shell.openPath(folder)
    return folders.length > 0
  })
  ipcMain.handle('notemd:resolve-image', async (_event, identifier: string, reference: string) => {
    const doc = await approvedNote(identifier)
    const notePath = path.resolve(doc.root, doc.relative)
    return resolveImageDataUrl(notePath, reference)
  })
  ipcMain.handle('notemd:export-html', async (_event, name: string, html: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: `${path.parse(name).name}.html`, filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (result.canceled || !result.filePath) return false
    const document = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${path.basename(name)}</title><style>body{max-width:860px;margin:64px auto;padding:0 28px;font:16px/1.85 system-ui,"Segoe UI",sans-serif;color:#253443}img{max-width:100%}pre{padding:18px;background:#f2f5f7;border-radius:10px;overflow:auto}blockquote{border-left:3px solid #53b9a4;padding-left:16px;color:#60717e}table{border-collapse:collapse}td,th{border:1px solid #d6dfe4;padding:8px 12px}.katex-display{text-align:center;margin:1.5em}</style><article class="markdown-body">${html}</article></html>`
    await fs.writeFile(result.filePath, document, 'utf8')
    return true
  })
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 920, minHeight: 600, show: false, title: 'NoteMd', backgroundColor: '#f5f7f8',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  windows.add(window)
  let readyToClose = false
  window.on('close', event => { if (!readyToClose) { event.preventDefault(); window.webContents.send('notemd:command', 'close') } })
  const closeReady = (event: Electron.IpcMainEvent) => { if (event.sender === window.webContents) { readyToClose = true; window.close() } }
  ipcMain.on('notemd:close-ready', closeReady)
  window.on('closed', () => ipcMain.removeListener('notemd:close-ready', closeReady))
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => windows.delete(window))
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.NOTEMD_DEV_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })
  const dev = process.env.NOTEMD_DEV_URL
  if (dev) await window.loadURL(dev)
  else await window.loadFile(path.resolve(here, '../renderer/index.html'))
}

app.whenReady().then(() => {
  setupIpc()
  installMenu()
  void createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
