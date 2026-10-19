import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createNote, createFolder, deleteEntry, importImages, listLibrary, moveEntry, readNote, renameEntry, reorderEntries, saveNote, helpersForTests } from '../src/main/files'

const temporaryRoots: string[] = []
async function library(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notemd-test-'))
  temporaryRoots.push(root)
  return root
}
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('lossless note storage', () => {
  it('saves and reopens repeated blank lines verbatim', async () => {
    const root = await library()
    const note = await createNote(root)
    const original = '# 第一行\n\n\n段落间保留两行空白。\n\n\n'
    const stamp = await saveNote(root, note.path, original, note.stamp)
    expect((await readNote(root, note.path)).content).toBe(original)
    await expect(saveNote(root, note.path, '# 错误覆盖', note.stamp)).rejects.toThrow(/changed on disk/)
    const updated = await saveNote(root, note.path, original, stamp)
    expect(updated.exists).toBe(true)
  })

  it('refuses a stale write after a competing external edit', async () => {
    const root = await library()
    const note = await createNote(root)
    await writeFile(path.join(root, note.path), '外部修改')
    await expect(saveNote(root, note.path, '待保存', note.stamp)).rejects.toThrow(/changed on disk/)
    expect(await readFile(path.join(root, note.path), 'utf8')).toBe('外部修改')
  })

  it('rejects traversal, reserved names and deletion outside the library', async () => {
    const root = await library()
    await expect(readNote(root, '../outside.md')).rejects.toThrow(/outside/)
    await expect(createFolder(root, '', '../victim')).rejects.toThrow(/folder name/)
    await expect(deleteEntry(root, '.')).rejects.toThrow()
    await expect(createFolder(root, '', '课程')).resolves.toBe('课程')
    await expect(createFolder(root, '课程', '第一周')).resolves.toBe('课程/第一周')
  })
})

describe('managed image assets', () => {
  it('stores pasted images beside a document and hides their folder from browsing', async () => {
    const root = await library()
    const folder = await createFolder(root, '', '课程')
    const note = await createNote(root, folder)
    const image = { name: '图 表.png', mimeType: 'image/png', bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]) }
    const first = await importImages(root, note.path, note.content, [image])
    expect(first.markdown).toMatch(/^!\[图 表\.png\]\(\d{8}-\d{6}-001\/%E5%9B%BE-%E8%A1%A8-001\.png\)$/)
    const next = await saveNote(root, note.path, first.markdown, note.stamp)
    const second = await importImages(root, note.path, first.markdown, [image])
    expect(second.markdown).toContain('%E5%9B%BE-%E8%A1%A8-002.png')
    expect((await listLibrary(root, folder)).map(entry => entry.name)).toEqual([path.basename(note.path)])
    expect((await readdir(path.dirname(path.join(root, note.path)))).filter(name => /^\d{8}-\d{6}-\d{3}$/.test(name))).toHaveLength(1)
    expect(next.exists).toBe(true)
  })

  it('copies local pictures and rewrites every reference when moving a note', async () => {
    const root = await library()
    const origin = await createFolder(root, '', '课程')
    const destination = await createFolder(root, '', '归档')
    const note = await createNote(root, origin)
    const markdown = '图一 ![界面](assets/a.png)\n图二 ![数据](assets/b.webp)\n'
    const oldAssets = path.join(root, origin, 'assets')
    await mkdir(oldAssets)
    await writeFile(path.join(oldAssets, 'a.png'), 'png-bytes')
    await writeFile(path.join(oldAssets, 'b.webp'), 'webp-bytes')
    const stamp = await saveNote(root, note.path, markdown, note.stamp)
    const moved = await moveEntry(root, note.path, destination)
    expect(moved).toMatch(/^归档\//)
    const result = await readNote(root, moved)
    expect(result.content).toContain('a.png')
    expect(result.content).toContain('b.webp')
    expect(await readFile(path.join(root, path.dirname(moved), decodeURIComponent(result.content.match(/\(([^)]+)\)/)![1]!)), 'utf8')).toBe('png-bytes')
    expect(await readFile(path.join(root, note.path), 'utf8').catch(() => '')).toBe('')
    expect(stamp.hash).toBeTruthy()
  })

  it('sorts library entries and renames markdown without renaming managed assets', async () => {
    const root = await library()
    const first = await createNote(root)
    const second = await createNote(root)
    const assets = await importImages(root, first.path, '', [{ name: 'a.jpg', mimeType: 'image/jpeg', bytes: Uint8Array.from([1, 2, 3]) }])
    const renamed = await renameEntry(root, first.path, '说明')
    const entries = await listLibrary(root)
    await reorderEntries(root, '', [path.basename(second.path), path.basename(renamed)])
    expect((await listLibrary(root)).map(item => item.name)).toEqual([path.basename(second.path), path.basename(renamed)])
    expect((await listLibrary(root)).map(item => item.kind)).toEqual(['file', 'file'])
    expect((await importImages(root, renamed, assets.markdown, [{ name: 'a.jpg', mimeType: 'image/jpeg', bytes: Uint8Array.from([4, 5]) }])).markdown).toContain('a-002.jpg')
    expect(entries).toHaveLength(2)
  })

  it('does not mistake web images for local managed assets', () => {
    expect(helpersForTests.managedFolderFromMarkdown('![web](https://x.test/a.png)', 'docs')).toBeNull()
  })
})
