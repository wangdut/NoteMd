import { afterEach, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { RecoveryStore } from '../src/main/recovery'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }) })
it('persists the latest draft and removes it after the disk catches up', async () => {
  await fs.mkdir('.test-data', { recursive: true }); const root = await fs.mkdtemp(path.resolve('.test-data/recovery-')); roots.push(root)
  const file = path.join(root, '文档.md'); await fs.writeFile(file, '磁盘')
  const store = new RecoveryStore(path.join(root, 'drafts')); const stamp = { hash: 'old-hash', exists: true }
  await Promise.all([store.write(file, '草稿 1', stamp), store.write(file, '草稿 2', stamp)])
  const [draft] = await new RecoveryStore(path.join(root, 'drafts')).list()
  expect(draft!.content).toBe('草稿 2'); expect(draft!.stamp).toEqual(stamp)
  await fs.writeFile(file, '草稿 2'); await store.write(file, '草稿 2', stamp)
  expect(await store.list()).toEqual([])
})
