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
  app = await electron.launch({ executablePath: process.env.NOTEMD_TEST_EXECUTABLE, args: process.env.NOTEMD_TEST_EXECUTABLE ? [] : ['.'], env })
  page = await app.firstWindow(); errors = []; page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByRole('heading', { name: '让想法有迹可循' })).toBeVisible()
})
test.afterEach(async () => {
  if (!page.isClosed()) await page.screenshot({ path: path.join(root, 'final.png') })
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



test('conflicts keep edits, recovery survives restart, close flushes and HTML/PDF export', async () => {
  await command('new'); const editor = page.locator('.cm-content'); await editor.click(); await page.keyboard.insertText('original'); await command('save')
  const file = (await fs.readdir(path.join(root,'library'))).find(name => name.endsWith('.md'))!
  const absolute = path.join(root,'library',file)
  await expect.poll(() => fs.readFile(absolute,'utf8')).toBe('original')
  await fs.writeFile(absolute,'external')
  await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' unsaved')
  await command('save'); await expect(page.getByRole('alert')).toContainText('changed on disk')
  expect(await fs.readFile(absolute,'utf8')).toBe('external')
  await expect.poll(async () => (await fs.readdir(path.join(root,'profile','recovery')).catch(()=>[])).filter(name=>name.endsWith('.json')).length).toBe(1)
  const env: Record<string,string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string,string] => e[1] !== undefined)), NOTEMD_USER_DATA:path.join(root,'profile'),NOTEMD_LIBRARY_PATH:path.join(root,'library') };delete env.ELECTRON_RUN_AS_NODE
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{})
  app=await electron.launch({executablePath:process.env.NOTEMD_TEST_EXECUTABLE,args:process.env.NOTEMD_TEST_EXECUTABLE?[]:['.'],env});page=await app.firstWindow();page.on('pageerror',err=>errors.push(err.message))
  await page.getByRole('button',{name:'恢复 '+file,exact:true}).click();await expect(page.locator('.cm-content')).toContainText('unsaved')
  const copy = path.join(root,'恢复副本.md')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},copy)
  await command('save-as');await expect(page.locator('.document-title')).toContainText('恢复副本.md');expect(await fs.readFile(copy,'utf8')).toBe('original unsaved')
  const html = path.join(root,'导出.html')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},html)
  await command('export-html');await expect.poll(()=>fs.readFile(html,'utf8').catch(()=>'' )).toContain('original unsaved')
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false')
  const pdf=path.join(root,'导出.pdf')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},pdf)
  await command('export-pdf');await expect.poll(()=>fs.readFile(pdf).then(b=>b.subarray(0,5).toString(),()=>''),{timeout:20000}).toBe('%PDF-')
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false')
  await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.insertText(' on close')
  await command('close'); await expect.poll(()=>fs.readFile(copy,'utf8')).toContain('on close')
})

test('folder and document sorting, copy, task toggle, CRLF roundtrip and read-only mode', async()=>{
  await fs.writeFile(path.join(root,'library','A.md'),'# 标题\r\n\r\n- [ ] 任务\r\n\r\n结尾\r\n')
  await fs.writeFile(path.join(root,'library','B.md'),'B')
  await command('sidebar-files');await page.getByTitle('刷新',{exact:true}).click()
  const a=page.locator('.file-row').filter({hasText:'A.md'}),b=page.locator('.file-row').filter({hasText:'B.md'})
  await b.dragTo(a,{targetPosition:{x:80,y:2}})
  await expect(page.locator('.file-row').first()).toContainText('B.md')
  await a.click(); await expect(page.locator('.live-block input')).toBeVisible();await page.locator('.live-block input').click()
  await command('save');await expect.poll(()=>fs.readFile(path.join(root,'library','A.md'),'utf8')).toContain('- [x]')
  const saved=await fs.readFile(path.join(root,'library','A.md'),'utf8');expect(saved.replaceAll('\r\n','')).not.toContain('\n')
  await command('mode-read');await page.locator('.cm-content').click();await page.keyboard.press('Enter');await page.keyboard.insertText('SHOULD NOT INSERT');await command('save')
  expect(await fs.readFile(path.join(root,'library','A.md'),'utf8')).toBe(saved)
  await a.click({button:'right'});await page.getByRole('button',{name:'创建副本',exact:true}).click();await expect(page.locator('.file-row')).toHaveCount(3)
  await a.click({button:'right'});await page.getByRole('button',{name:'复制路径',exact:true}).click();expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe(path.join(root,'library','A.md'))
})
