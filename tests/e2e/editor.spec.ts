import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
let app: ElectronApplication
let page: Page
let root: string
let errors: string[]
async function command(name: string) { await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]!.webContents.send('notemd:command', value), name) }
test.beforeEach(async () => {
  await fs.mkdir('test-results/runtime', { recursive: true })
  root = await fs.mkdtemp(path.resolve('test-results/runtime/app-'))
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), NOTEMD_USER_DATA: path.join(root, 'profile'), NOTEMD_LIBRARY_PATH: path.join(root, 'library') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: ['.'], env })
  page = await app.firstWindow(); errors = []; page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByRole('heading', { name: '让想法有迹可循' })).toBeVisible()
})
test.afterEach(async () => {
  await page.screenshot({ path: path.join(root, 'final.png') })
  await app.close()
  expect(errors).toEqual([])
})
test('blank lines, autosave, undo, modes, outline and independent zoom', async () => {
  await command('new'); await expect(page.locator('.cm-editor')).toBeVisible()
  const editor = page.locator('.cm-content')
  await editor.click(); await page.keyboard.insertText('# 第一章')
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
  await page.keyboard.insertText('正文 **加粗**')
  await command('save')
  const files = await fs.readdir(path.join(root, 'library')); const file = files.find(name => name.endsWith('.md'))!
  await expect.poll(() => fs.readFile(path.join(root, 'library', file), 'utf8')).toBe('# 第一章\n\n\n正文 **加粗**')
  await expect(page.locator('.live-block h1')).toHaveText('第一章')
  await page.waitForTimeout(600) // Start a distinct undo group after the save. 
  await page.keyboard.insertText('后加'); await command('save'); await expect(page.locator('.document-title')).not.toContainText('未保存')
  await command('undo'); await expect(editor).not.toContainText('后加')
  await command('save')
  await page.getByRole('button', { name: '阅读', exact: true }).click(); await expect(page.locator('.live-block strong')).toHaveText('加粗')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await page.getByRole('button', { name: '源码', exact: true }).click(); await expect(page.locator('.live-block')).toHaveCount(0)
  await page.getByRole('button', { name: '实时', exact: true }).click()
  await page.locator('.toc-panel button').click(); await expect(editor).toContainText('# 第一章')
  await page.locator('.editor-host').dispatchEvent('wheel', { ctrlKey: true, deltaY: -100 }); await expect(page.locator('.status-bar')).toContainText('110%')
  await page.locator('.sidebar').dispatchEvent('wheel', { ctrlKey: true, deltaY: -100 }); await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--toc-zoom'))).toBe('1.1')
  await command('theme-dark'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '文件库', exact: true }).click(); await page.locator('.file-row').click(); await command('mode-source')
  await expect(editor).toContainText('正文 **加粗**')
  expect(await fs.readFile(path.join(root, 'library', file), 'utf8')).toBe('# 第一章\n\n\n正文 **加粗**')
})
test('image paste, hidden assets, rename, move and save-as preserve rendering', async () => {
  await command('new'); await page.locator('.cm-content').click()
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII='
  await app.evaluate(({ clipboard, nativeImage }, data) => clipboard.writeImage(nativeImage.createFromBitmap(Buffer.alloc(16, 255), { width: 2, height: 2 })), png)
  await page.keyboard.press('Control+v')
  await expect.poll(async () => (await fs.readdir(path.join(root, 'library'))).filter(name => /^\d{8}-\d{6}-\d{3}$/.test(name)).length).toBe(1)
  await command('save'); await command('mode-read')
  const image = page.locator('.live-block img'); await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '文件库', exact: true }).click(); await expect(page.locator('.file-row')).toHaveCount(1)
  await page.locator('.file-row').click({ button: 'right' }); await page.getByRole('button', { name: '重命名', exact: true }).click()
  await page.getByRole('textbox', { name: '重命名' }).fill('图片笔记'); await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.document-title')).toContainText('图片笔记.md')
  await page.getByTitle('新建文件夹').click(); await page.getByRole('textbox', { name: '新建文件夹' }).fill('归档'); await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.file-row')).toHaveCount(2)
  await page.locator('.file-row').filter({ hasText: '图片笔记.md' }).click({ button: 'right' }); await page.getByRole('button', { name: '移动到…', exact: true }).click()
  await page.getByRole('textbox', { name: '移动到文件库目录' }).fill('归档'); await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => fs.readFile(path.join(root, 'library', '归档', '图片笔记.md'), 'utf8').catch(() => '')).toContain('![')
  await expect.poll(() => page.locator('.live-block img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  const destination = path.join(root, 'copy.md')
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }) }, destination)
  await command('save-as'); await expect(page.locator('.document-title')).toContainText('copy.md')
  await expect.poll(() => page.locator('.live-block img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(await fs.readFile(destination, 'utf8')).toContain('![')
})


