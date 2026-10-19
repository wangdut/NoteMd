import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { NoteStamp } from './files.js'
export interface Draft { id: string; path: string; content: string; stamp: NoteStamp; updatedAt: number }
export class RecoveryStore {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private folder: string) {}
  private serial<T>(work: () => Promise<T>): Promise<T> { const next = this.queue.catch(() => {}).then(work); this.queue = next; return next }
  write(notePath: string, content: string, stamp: NoteStamp): Promise<void> {
    return this.serial(async () => {
      await fs.mkdir(this.folder, { recursive: true })
      const id = createHash('sha256').update(path.resolve(notePath).toLowerCase()).digest('hex')
      const file = path.join(this.folder, id + '.json')
      const disk = await fs.readFile(notePath, 'utf8').catch(() => null)
      if (disk === content) { await fs.rm(file, { force: true }); return }
      const draft: Draft = { id, path: path.resolve(notePath), content, stamp, updatedAt: Date.now() }
      const temp = file + '.' + randomUUID() + '.tmp'
      await fs.writeFile(temp, JSON.stringify(draft), 'utf8'); await fs.rename(temp, file)
    })
  }
  async list(): Promise<Draft[]> {
    await this.queue.catch(() => {})
    const names = await fs.readdir(this.folder).catch(() => [])
    const result: Draft[] = []
    for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      try {
        const draft = JSON.parse(await fs.readFile(path.join(this.folder, name), 'utf8')) as Draft
        if (draft.id + '.json' === name && typeof draft.content === 'string' && path.isAbsolute(draft.path) && typeof draft.stamp?.hash === 'string') result.push(draft)
      } catch { /* A damaged recovery file must not block startup. */ }
    }
    return result.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  async get(id: string): Promise<Draft> { const draft = (await this.list()).find(d => d.id === id); if (!draft) throw new Error('恢复草稿不存在'); return draft }
}
