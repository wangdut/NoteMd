import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('noteMd', {
  clipboard: (action: string, text?: string) => ipcRenderer.invoke('notemd:clipboard',action,text),
  copyImage: (identifier: string, reference: string) => ipcRenderer.invoke('notemd:copy-image',identifier,reference),
  renameCurrent: (identifier: string, name: string) => ipcRenderer.invoke('notemd:rename-current',identifier,name),
  pickImages: () => ipcRenderer.invoke('notemd:pick-images'),
  duplicate: (relative: string) => ipcRenderer.invoke('notemd:duplicate', relative),
  copyPath: (relative: string) => ipcRenderer.invoke('notemd:copy-path', relative),
  writeDraft: (identifier: string, content: string, stamp: { hash: string; exists: boolean }) => ipcRenderer.invoke('notemd:draft', identifier, content, stamp),
  listDrafts: () => ipcRenderer.invoke('notemd:drafts'),
  recover: (id: string) => ipcRenderer.invoke('notemd:recover', id),
  openLink: (url: string) => ipcRenderer.invoke('notemd:open-link', url),
  saveAs: (source: string, destination: string, content: string) => ipcRenderer.invoke('notemd:save-as', source, destination, content),
  closeReady: () => ipcRenderer.send('notemd:close-ready'),
  getState: () => ipcRenderer.invoke('notemd:state'),
  setPreference: (key: string, value: unknown) => ipcRenderer.invoke('notemd:preference', key, value),
  chooseLibrary: () => ipcRenderer.invoke('notemd:choose-library'),
  chooseOpenFile: () => ipcRenderer.invoke('notemd:open-file'),
  chooseSaveFile: (name: string) => ipcRenderer.invoke('notemd:save-file', name),
  list: (folder = '') => ipcRenderer.invoke('notemd:list', folder),
  createNote: (folder = '') => ipcRenderer.invoke('notemd:create-note', folder),
  openNote: (relative: string) => ipcRenderer.invoke('notemd:read-note', relative),
  openExternal: (absolute: string) => ipcRenderer.invoke('notemd:read-external', absolute),
  saveNote: (relative: string, content: string, stamp: { hash: string; exists: boolean }) => ipcRenderer.invoke('notemd:save-note', relative, content, stamp),
  createFolder: (folder: string, name: string) => ipcRenderer.invoke('notemd:create-folder', folder, name),
  importImages: (relative: string, content: string, images: Array<{ name: string; mimeType: string; bytes: Uint8Array }>) => ipcRenderer.invoke('notemd:import-images', relative, content, images),
  rename: (relative: string, name: string) => ipcRenderer.invoke('notemd:rename', relative, name),
  move: (relative: string, destination: string) => ipcRenderer.invoke('notemd:move', relative, destination),
  reorder: (folder: string, names: string[]) => ipcRenderer.invoke('notemd:reorder', folder, names),
  trash: (relative: string) => ipcRenderer.invoke('notemd:trash', relative),
  reveal: (relative: string) => ipcRenderer.invoke('notemd:reveal', relative),
  showAssets: (relative: string) => ipcRenderer.invoke('notemd:show-assets', relative),
  resolveImage: (absolute: string, reference: string) => ipcRenderer.invoke('notemd:resolve-image', absolute, reference),
  exportHtml: (name: string, html: string, format: string = 'html') => ipcRenderer.invoke('notemd:export-html', name, html, format),
  onCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command)
    ipcRenderer.on('notemd:command', listener)
    return () => ipcRenderer.removeListener('notemd:command', listener)
  },
})
