import { describe, expect, it } from 'vitest'
import { DocumentSession } from '../src/renderer/src/session'

describe('document save lifecycle', () => {
  it('serializes an edit made during an in-flight save without losing dirty state', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const writes: string[] = []
    const session = new DocumentSession('note.md', { path: 'note.md', content: '', stamp: { hash: '0', exists: true } }, async (_path, content, stamp) => {
      writes.push(content)
      if (writes.length === 1) await gate
      expect(stamp.hash).toBe(String(writes.length - 1))
      return { hash: String(writes.length), exists: true }
    })
    session.edit('first'); const saving = session.save()
    session.edit('second'); expect(session.dirty).toBe(true)
    const concurrent = session.save(); release(); await Promise.all([saving, concurrent])
    expect(writes).toEqual(['first', 'second']); expect(session.dirty).toBe(false)
  })
  it('retains unsaved text after a disk conflict', async () => {
    const session = new DocumentSession('note.md', { path: 'note.md', content: 'old', stamp: { hash: '0', exists: true } }, async () => { throw new Error('conflict') })
    session.edit('new'); await expect(session.save()).rejects.toThrow('conflict')
    expect(session.content).toBe('new'); expect(session.dirty).toBe(true)
  })
})
