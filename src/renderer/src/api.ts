import type { LibraryEntry, NoteStamp } from '../../main/files'

export interface AppState {
  libraryPath: string
  theme: 'light' | 'dark' | 'paper'
  editorZoom: number
  tocZoom: number
  sidebar: 'toc' | 'files'
}

export interface OpenNote {
  path: string
  content: string
  stamp: NoteStamp
}

export interface PasteImage {
  name: string
  mimeType: string
  bytes: Uint8Array
}

declare global {
  interface Window {
    activeNotePath?: string
    noteMd: {
      openLink(url: string): Promise<void>
      saveAs(source: string, destination: string, content: string): Promise<OpenNote>
      closeReady(): void
      getState(): Promise<AppState>
      setPreference(key: string, value: unknown): Promise<AppState>
      chooseLibrary(): Promise<AppState | null>
      chooseOpenFile(): Promise<string | null>
      chooseSaveFile(name: string): Promise<string | null>
      list(folder?: string): Promise<LibraryEntry[]>
      createNote(folder?: string): Promise<OpenNote>
      openNote(relative: string): Promise<OpenNote>
      openExternal(absolute: string): Promise<OpenNote>
      saveNote(relative: string, content: string, stamp: NoteStamp): Promise<NoteStamp>
      createFolder(folder: string, name: string): Promise<string>
      importImages(relative: string, content: string, images: PasteImage[]): Promise<{ paths: string[]; markdown: string }>
      rename(relative: string, name: string): Promise<string>
      move(relative: string, destination: string): Promise<string>
      reorder(folder: string, names: string[]): Promise<void>
      trash(relative: string): Promise<void>
      reveal(relative: string): Promise<void>
      showAssets(relative: string): Promise<boolean>
      resolveImage(absolute: string, reference: string): Promise<string>
      exportHtml(name: string, html: string): Promise<boolean>
      onCommand(callback: (command: string) => void): () => void
    }
  }
}
