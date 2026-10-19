import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell, nativeTheme, nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RecoveryStore } from './recovery.js'
import { copyNote, libraryItemPath, managedAssetFolders, createNote, createFolder, importImages, listLibrary, moveEntry, readNote, renameEntry, reorderEntries, resolveImageDataUrl, saveNote } from './files.js'

if (process.env.NOTEMD_USER_DATA) app.setPath('userData', path.resolve(process.env.NOTEMD_USER_DATA))
const here = path.dirname(fileURLToPath(import.meta.url))
const windows = new Set<BrowserWindow>()
const approvedExternal = new Set<string>()
const approvedSaveStamps = new Map<string, { hash: string; exists: boolean }>()
let recovery: RecoveryStore
let preferenceQueue: Promise<unknown> = Promise.resolve()
interface Preferences { libraryPath: string; theme: 'light' | 'dark' | 'paper'; editorZoom: number; tocZoom: number; sidebarWidth: number; sidebar: 'toc' | 'files' }
const defaults = (): Preferences => ({ libraryPath: process.env.NOTEMD_LIBRARY_PATH || path.join(app.getPath('documents'), 'NoteMd'), theme: 'light', editorZoom: 100, tocZoom: 100, sidebarWidth:258, sidebar: 'toc' })
function applyWindowTheme(theme: Preferences['theme']) {
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  const color = theme === 'dark' ? '#17242e' : theme === 'paper' ? '#faf5e9' : '#ffffff'
  const symbolColor = theme === 'dark' ? '#d9e6e9' : theme === 'paper' ? '#443e30' : '#25383c'
  for (const window of windows) { window.setBackgroundColor(color); if(process.platform==='win32')window.setTitleBarOverlay({color,symbolColor,height:34}) }
}
const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) app.quit()
app.on('second-instance', () => { const window = activeWindow(); if (window?.isMinimized()) window.restore(); window?.focus() })

async function preferences(): Promise<Preferences> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
    return { ...defaults(), ...value }
  } catch { return defaults() }
}
async function updatePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const work = preferenceQueue.catch(() => {}).then(async () => {
    const next = { ...(await preferences()), ...patch }
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    const target = path.join(app.getPath('userData'), 'settings.json')
    await fs.writeFile(target + '.tmp', JSON.stringify(next, null, 2), 'utf8')
    await fs.rename(target + '.tmp', target)
    return next
  })
  preferenceQueue = work
  return work
}
const activeWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? [...windows].at(-1)


async function approvedNote(identifier: string): Promise<{ root: string; relative: string }> {
  if (path.isAbsolute(identifier)) {
    const absolute = path.resolve(identifier)
    if (!approvedExternal.has(absolute)) throw new Error('Open this Markdown file with the document picker first.')
    return { root: path.dirname(absolute), relative: path.basename(absolute) }
  }
  return { root: (await preferences()).libraryPath, relative: identifier }
}

function setupIpc(): void {
  recovery = new RecoveryStore(path.join(app.getPath('userData'), 'recovery'))
  ipcMain.handle('notemd:clipboard', (event, action: string, text?: string) => {
    if (action === 'write') { clipboard.writeText(String(text ?? '')); return }
    if (action === 'read') return clipboard.readText()
    const target = event.sender
    if (action === 'copy') target.copy(); else if (action === 'cut') target.cut(); else if (action === 'paste') target.paste(); else if (action === 'select-all') target.selectAll(); else throw new Error('Unsupported clipboard action')
  })
  ipcMain.handle('notemd:copy-image', async (_event, identifier: string, reference: string) => {
    const doc = await approvedNote(identifier); const target = await libraryItemPath(doc.root, doc.relative)
    if (/^https?:/i.test(reference)) throw new Error('远程图片请先保存到本地，或使用复制 Markdown。')
    const data = await resolveImageDataUrl(target, reference); const image = nativeImage.createFromDataURL(data)
    if(image.isEmpty())throw new Error('该图片格式无法复制到系统剪贴板。'); clipboard.writeImage(image)
  })
  ipcMain.handle('notemd:rename-current', async (_event, identifier: string, name: string) => {
    const doc = await approvedNote(identifier); const relative = await renameEntry(doc.root,doc.relative,name)
    if(path.isAbsolute(identifier)){const next=path.resolve(doc.root,relative);approvedExternal.delete(path.resolve(identifier));approvedExternal.add(next);return next}
    return relative
  })
  ipcMain.handle('notemd:draft', async (_event, identifier: string, content: string, stamp: { hash: string; exists: boolean }) => {
    const doc = await approvedNote(identifier)
    const target = path.resolve(doc.root, doc.relative)
    await libraryItemPath(doc.root, doc.relative)
    await recovery.write(target, content, stamp)
  })
  ipcMain.handle('notemd:drafts', async () => (await recovery.list()).map(d => ({ id: d.id, path: d.path, updatedAt: d.updatedAt })))
  ipcMain.handle('notemd:recover', async (_event, id: string) => {
    const draft = await recovery.get(id)
    approvedExternal.add(draft.path)
    let stamp = draft.stamp
    try { await fs.access(draft.path) } catch { stamp = { hash: '', exists: false } }
    return { path: draft.path, content: draft.content, stamp }
  })
  ipcMain.handle('notemd:open-link', async (_event, url: string) => { if (!/^(https?:|mailto:)/i.test(url)) throw new Error('不支持的链接'); await shell.openExternal(url) })
  ipcMain.handle('notemd:pick-images', async () => {
    const result = await dialog.showOpenDialog({ title: '插入图片', properties: ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'] }] })
    if (result.canceled) return []
    const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.avif': 'image/avif' }
    return Promise.all(result.filePaths.map(async file => { if ((await fs.stat(file)).size > 25 * 1024 * 1024) throw new Error('图片不能超过 25 MB'); return { name: path.basename(file), mimeType: mime[path.extname(file).toLowerCase()], bytes: new Uint8Array(await fs.readFile(file)) } }))
  })
  ipcMain.handle('notemd:state', async () => {
    const state = await preferences()
    await fs.mkdir(state.libraryPath, { recursive: true })
    return state
  })
  ipcMain.handle('notemd:preference', async (_event, key: keyof Preferences, value: unknown) => {
    if (key === 'theme' && !['light', 'dark', 'paper'].includes(String(value))) throw new Error('Unknown theme.')
    if ((key === 'editorZoom' || key === 'tocZoom') && (typeof value !== 'number' || !Number.isFinite(value) || value < 70 || value > 200)) throw new Error('Zoom must be between 70% and 200%.')
    if (key === 'sidebar' && !['toc', 'files'].includes(String(value))) throw new Error('Unknown sidebar.')
    if (key === 'sidebarWidth' && (typeof value !== 'number' || !Number.isFinite(value) || value < 180 || value > 520)) throw new Error('侧栏宽度必须为 180–520。')
    if (!['theme', 'editorZoom', 'tocZoom', 'sidebar', 'sidebarWidth'].includes(key)) throw new Error('Unsupported preference.')
    const next = await updatePreferences({ [key]: value }); if(key==='theme')applyWindowTheme(next.theme); return next
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
    const saved = await saveNote(doc.root, doc.relative, content, stamp)
    await recovery.write(path.resolve(doc.root, doc.relative), content, saved)
    return saved
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
  ipcMain.handle('notemd:copy-path', async (_event, relative: string) => {
    const doc = await approvedNote(relative)
    clipboard.writeText(await libraryItemPath(doc.root, doc.relative))
  })
  ipcMain.handle('notemd:duplicate', async (_event, relative: string) => {
    const root = (await preferences()).libraryPath
    const source = await libraryItemPath(root, relative)
    const parsed = path.parse(source)
    if ((await fs.lstat(source)).isDirectory()) {
      for (let i = 1; i <= 999; i++) {
        const target = path.join(parsed.dir, `${parsed.name}-副本-${i}`)
        try { await fs.mkdir(target) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error }
        try {
          await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false, filter: async file => { if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('不能复制符号链接。'); return true } })
          return path.relative(root, target).split(path.sep).join('/')
        } catch (error) { await fs.rm(target, { recursive: true, force: true }); throw error }
      }
    } else {
      const note = await readNote(root, relative)
      for (let i = 1; i <= 999; i++) {
        const target = path.join(parsed.dir, `${parsed.name}-副本-${i}${parsed.ext}`)
        try { await fs.copyFile(source, target, 1); return path.relative(root, target).split(path.sep).join('/') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      }
    }
    throw new Error('无法分配副本名称。')
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
    const notePath = await libraryItemPath(doc.root, doc.relative)
    return resolveImageDataUrl(notePath, reference)
  })
  ipcMain.handle('notemd:export-html', async (_event, name: string, html: string, format: 'html' | 'pdf' = 'html') => {
    if (!['html', 'pdf'].includes(format)) throw new Error('不支持的导出格式。')
    const result = await dialog.showSaveDialog({ defaultPath: `${path.parse(name).name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (result.canceled || !result.filePath) return false
    const fonts = path.resolve(here, '../renderer/assets')
    let katexCss = await fs.readFile(path.join(fonts, 'export-katex.css'), 'utf8').catch(() => '')
    for (const match of [...katexCss.matchAll(/url\(([^)]+)\)/g)]) {
      const file = path.join(fonts, path.basename(match[1]!))
      const bytes = await fs.readFile(file).catch(() => null)
      if (bytes) katexCss = katexCss.replace(match[0], `url(data:font/woff2;base64,${bytes.toString('base64')})`)
    }
    const title = path.basename(name).replace(/[<>&"]/g, '')
    const document = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: https: http:"><meta name="viewport" content="width=device-width"><title>${title}</title><style>${katexCss}body{max-width:860px;margin:64px auto;padding:0 28px;font:16px/1.85 system-ui,"Segoe UI",sans-serif;color:#253443}img{max-width:100%}pre{padding:18px;background:#f2f5f7;border-radius:10px;overflow:auto}blockquote{border-left:3px solid #53b9a4;padding-left:16px;color:#60717e}table{border-collapse:collapse}td,th{border:1px solid #d6dfe4;padding:8px 12px}.katex-display{text-align:center;margin:1.5em}a{color:#128977}mark{background:#f6e69d}.document-toc a{display:block}@media print{body{margin:0}pre{white-space:pre-wrap}}</style><article class="markdown-body">${html}</article></html>`
    if (format === 'html') await fs.writeFile(result.filePath, document, 'utf8')
    else {
      const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } })
      try {
        await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(document))
        await printWindow.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode().catch(()=>{}))])')
        const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
        await fs.writeFile(result.filePath, pdf)
      } finally { printWindow.destroy() }
    }
    return true
  })
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 920, minHeight: 600, show: false, title: 'NoteMd', backgroundColor: '#f5f7f8',
    icon: path.resolve(here, '../../resources/icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { color:'#ffffff',symbolColor:'#25383c',height:34 },
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  windows.add(window)
  applyWindowTheme((await preferences()).theme)
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
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.NOTEMD_DEV_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })
  const dev = process.env.NOTEMD_DEV_URL
  if (dev) await window.loadURL(dev)
  else await window.loadFile(path.resolve(here, '../renderer/index.html'))
}

if (singleInstance) app.whenReady().then(() => {
  setupIpc()
  Menu.setApplicationMenu(null)
  void createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
