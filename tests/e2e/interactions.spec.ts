import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
async function launch(source:string){
  const root=await fs.mkdtemp(path.resolve('test-results/interaction-'));await fs.mkdir(path.join(root,'library'));await fs.writeFile(path.join(root,'library','交互测试.md'),source)
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined)),NOTEMD_USER_DATA:path.join(root,'profile'),NOTEMD_LIBRARY_PATH:path.join(root,'library')};delete env.ELECTRON_RUN_AS_NODE
  const app=await electron.launch({executablePath:process.env.NOTEMD_TEST_EXECUTABLE,args:process.env.NOTEMD_TEST_EXECUTABLE?[]:['.'],env});const page=await app.firstWindow();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'文件库',exact:true}).click();await page.locator('.file-row').click()
  return {app,page,root,errors}
}
async function command(app:ElectronApplication,name:string){await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0]!.webContents.send('notemd:command',value),name)}
async function saved(app:ElectronApplication,page:Page){await command(app,'save');await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');await expect(page.locator('.document-title')).not.toContainText('未保存')}

test('clicking rendered math keeps formula visible and its position stable', async () => {
  const root = await fs.mkdtemp(path.resolve('test-results/interaction-'))
  await fs.mkdir(path.join(root, 'library'))
  await fs.writeFile(path.join(root, 'library', '点击测试.md'), '# 标题\n\n前文\n\n$$\nx^2 + y^2\n$$\n\n```js\nconst first = 1\nconst second = 2\n```\n\n结尾')
  const env: Record<string,string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string,string] => e[1] !== undefined)), NOTEMD_USER_DATA: path.join(root, 'profile'), NOTEMD_LIBRARY_PATH: path.join(root, 'library') }; delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath:process.env.NOTEMD_TEST_EXECUTABLE,args:process.env.NOTEMD_TEST_EXECUTABLE?[]:['.'], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '文件库', exact: true }).click()
    await page.locator('.file-row').click()
    const math = page.locator('.katex').first()
    await expect(math).toBeVisible()
    const before = await math.boundingBox()
    await math.click()
    await expect(math).toBeVisible()
    const after = await math.boundingBox()
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2)
    await expect(page.locator('.cm-line')).not.toContainText(['$$'])
  } finally { await app.close() }
})

test('title rename, themed menus, shortcuts and persistent sidebar width',async()=>{
  const {app,page,root,errors}=await launch('# 标题\n\n第一项\n第二项')
  try {
    await page.locator('.document-title').dblclick();await page.getByRole('textbox',{name:'重命名文档'}).fill('新的名称');await page.getByRole('button',{name:'确定',exact:true}).click();await expect(page.locator('.document-title')).toContainText('新的名称.md')
    expect(await fs.readFile(path.join(root,'library','新的名称.md'),'utf8')).toContain('第一项')
    const resizer=page.getByRole('separator',{name:'调整侧栏宽度'});const rect=await resizer.boundingBox();await page.mouse.move(rect!.x+2,rect!.y+100);await page.mouse.down();await page.mouse.move(rect!.x+102,rect!.y+100,{steps:8});await page.mouse.up();await expect(page.locator('.sidebar')).toHaveCSS('width','358px')
    await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(root,'profile','settings.json'),'utf8')).sidebarWidth).toBe(358)
    await page.keyboard.press('Alt+t');await page.getByRole('menuitem',{name:'深色',exact:true}).click();await expect(page.locator('.titlebar')).toHaveCSS('background-color','rgb(23, 36, 46)');await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
    expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.getBackgroundColor())).toMatch(/17242e/i)
    await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.press('Control+Shift+7');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.insertText('第三项');await saved(app,page)
    const source=await fs.readFile(path.join(root,'library','新的名称.md'),'utf8');expect(source).toContain('1. 第二项\n2. 第三项');await expect(page.locator('.list-marker')).toHaveCount(2)
    await page.keyboard.press('F1');await expect(page.getByRole('dialog',{name:'快捷键速览'})).toContainText('Ctrl+Shift+7');await page.getByRole('button',{name:'关闭',exact:true}).click()
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('right click colors the selected text and keeps rendered code editable',async()=>{
  const {app,page,root,errors}=await launch('颜色测试\n\n```js\nconst first = 1\nconst second = 2\n```\n\n结尾')
  try {
    await page.locator('.cm-line').filter({hasText:'颜色测试'}).click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.locator('.cm-line').filter({hasText:'颜色测试'}).click({button:'right'});await page.getByRole('menuitem',{name:'字体颜色…',exact:true}).click()
    await page.getByRole('textbox',{name:'颜色值'}).fill('#d64545');await page.getByRole('button',{name:'应用',exact:true}).click();await saved(app,page)
    expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('<span style="color:#d64545">颜色测试</span>')
    await expect(page.locator('.cm-line').first()).not.toContainText('<span');await expect(page.locator('.cm-line').first().locator('span[style]')).toHaveCSS('color','rgb(214, 69, 69)')
    const code=page.locator('.live-code-line').filter({hasText:'const second'});const before=await code.boundingBox();await code.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Control+c');expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('const second = 2');expect(Math.abs((await code.boundingBox())!.y-before!.y)).toBeLessThan(2)
    await page.keyboard.press('End');await page.keyboard.insertText(';');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('const second = 2;');await expect(page.locator('.cm-line')).not.toContainText(['```'])
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('table dimensions, editable cells, context operations and tab extension',async()=>{
  const {app,page,root,errors}=await launch('表格前文\n\n')
  try {
    await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await page.keyboard.press('Control+t');await page.getByRole('spinbutton',{name:'正文行数'}).fill('3');await page.getByRole('spinbutton',{name:'列数',exact:true}).fill('4');await page.getByRole('button',{name:'应用',exact:true}).click()
    await expect(page.locator('.node-table tr')).toHaveCount(4);await expect(page.locator('.node-table th')).toHaveCount(4)
    const cell=page.getByRole('textbox',{name:'表格 第2行 第2列'});await cell.click();await page.keyboard.insertText('中文单元格');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('中文单元格')
    await cell.click({button:'right'});await page.getByRole('menuitem',{name:'右侧插入列',exact:true}).click();await expect(page.locator('.node-table th')).toHaveCount(5)
    await page.getByRole('textbox',{name:'表格 第2行 第2列'}).click({button:'right'});await page.getByRole('menuitem',{name:'下方插入行',exact:true}).click();await expect(page.locator('.node-table tr')).toHaveCount(5)
    await page.getByRole('textbox',{name:'表格 第5行 第5列'}).click();await page.keyboard.press('Tab');await expect(page.locator('.node-table tr')).toHaveCount(6)
    await page.getByRole('textbox',{name:'表格 第2行 第2列'}).click({button:'right'});await page.getByRole('menuitem',{name:'列居中',exact:true}).click();await expect(page.locator('.node-table tr').nth(1).locator('td').nth(1)).toHaveCSS('text-align','center')
    await page.getByRole('textbox',{name:'表格 第2行 第2列'}).click({button:'right'});await page.getByRole('menuitem',{name:'字体颜色…',exact:true}).click();await page.getByRole('textbox',{name:'颜色值'}).fill('#2471c8');await page.getByRole('button',{name:'应用',exact:true}).click();await expect(page.locator('.node-table td span[style]')).toHaveCSS('color','rgb(36, 113, 200)')
    await page.getByRole('textbox',{name:'表格 第3行 第3列'}).click({button:'right'});await page.getByRole('menuitem',{name:'删除当前列',exact:true}).click();await expect(page.locator('.node-table th')).toHaveCount(4)
    await page.getByRole('textbox',{name:'表格 第3行 第3列'}).click({button:'right'});await page.getByRole('menuitem',{name:'删除当前行',exact:true}).click();await expect(page.locator('.node-table tr')).toHaveCount(5)
    await saved(app,page);await command(app,'mode-source');await expect(page.locator('.cm-content')).toContainText('中文单元格');await command(app,'mode-live');await expect(page.locator('.node-table tr')).toHaveCount(5)
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('selected image remains visible, copies pixels, edits path and formula in a dialog',async()=>{
  const {app,page,root,errors}=await launch('图片前文\n\n$$\nx^2\n$$\n\n')
  try {
    await page.locator('.cm-content').click();await page.keyboard.press('Control+End');await app.evaluate(({clipboard,nativeImage})=>clipboard.writeImage(nativeImage.createFromBitmap(Buffer.alloc(16,255),{width:2,height:2})));await page.keyboard.press('Control+v')
    const image=page.locator('.node-image img');await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBe(2)
    const before=await image.boundingBox();await image.click();await expect(image).toBeVisible();expect(Math.abs((await image.boundingBox())!.y-before!.y)).toBeLessThan(2);await expect(page.locator('.image-path')).toBeVisible();await expect(page.locator('.image-path')).toContainText('image-001.png')
    await page.getByRole('button',{name:'复制图片',exact:true}).click();expect(await app.evaluate(({clipboard})=>clipboard.readImage().getSize())).toEqual({width:2,height:2})
    await image.click();await page.getByRole('button',{name:'图片路径',exact:true}).click();await page.getByRole('textbox',{name:'图片说明'}).fill('新的说明');await page.getByRole('button',{name:'应用',exact:true}).click();await expect(page.locator('.node-image img')).toHaveAttribute('alt','新的说明');await saved(app,page)
    expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('![新的说明](')
    await page.locator('.node-math .katex').click();await page.getByRole('button',{name:'编辑公式',exact:true}).click();await page.getByRole('textbox',{name:'LaTeX 公式'}).fill('E=mc^2');await expect(page.locator('.formula-preview .katex')).toBeVisible();await expect(page.locator('.node-math .katex')).toBeVisible();await page.getByRole('button',{name:'应用',exact:true}).click();await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('E=mc^2')
    expect(errors).toEqual([])
  }finally{await app.close()}
})

test('multiline lists, empty item exit, indentation and table undo survive save',async()=>{
  const {app,page,root,errors}=await launch('甲\n乙\n丙')
  try{
    await page.locator('.cm-content').click();await page.keyboard.press('Control+a');await page.keyboard.press('Control+Shift+7');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toBe('1. 甲\n2. 乙\n3. 丙')
    await page.keyboard.press('Control+End');await page.keyboard.press('Tab');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('  3. 丙');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.insertText('退出列表');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).toContain('3. 丙\n\n退出列表')
    await command(app,'table');await page.getByRole('button',{name:'应用',exact:true}).click();const cell=page.getByRole('textbox',{name:'表格 第2行 第1列'});await cell.click();await page.keyboard.insertText('撤销测试');await page.waitForTimeout(600);await page.keyboard.insertText('附加');await page.keyboard.press('Control+z');await expect(cell).toHaveText('撤销测试');await saved(app,page);expect(await fs.readFile(path.join(root,'library','交互测试.md'),'utf8')).not.toContain('附加')
    expect(errors).toEqual([])
  }finally{await app.close()}
})
