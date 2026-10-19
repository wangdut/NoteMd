import type { NoteStamp } from '../../main/files'
import type { OpenNote } from './api'

/** A session owns its disk version; a save never acknowledges later edits. */
export class DocumentSession {
  content: string
  private saved: string | null
  stamp: NoteStamp
  private pending?: Promise<void>
  constructor(readonly identifier: string, note: OpenNote, private write: (path: string, content: string, stamp: NoteStamp) => Promise<NoteStamp>) {
    this.content = this.saved = note.content
    this.stamp = note.stamp
  }
  get dirty(): boolean { return this.content !== this.saved }
  edit(content: string): void { this.content = content }
  markRecovered(): void { this.saved = null }
  async save(): Promise<void> {
    if (this.pending) return this.pending
    this.pending = this.drain()
    try { await this.pending } finally { this.pending = undefined }
  }
  private async drain(): Promise<void> {
    while (this.dirty) {
      const snapshot = this.content
      this.stamp = await this.write(this.identifier, snapshot, this.stamp)
      this.saved = snapshot
    }
  }
}
