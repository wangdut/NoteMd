import { _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const fixtures=path.resolve('.test-data/user-fixtures')
const root=await fs.mkdtemp(path.resolve('test-results/fixtures-'))
await fs.cp(fixtures,path.join(root,'library'),{recursive:true})
await fs.mkdir('artifacts/screenshots',{recursive:true})
const env={...process.env,NOTEMD_USER_DATA:path.join(root,'profile'),NOTEMD_LIBRARY_PATH:path.join(root,'library')};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.NOTEMD_TEST_EXECUTABLE,args:process.env.NOTEMD_TEST_EXECUTABLE?[]:['.'],env});const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message))
const command=async value=>{await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].webContents.send('notemd:command',value),value);await page.waitForFunction(()=>document.querySelector('.app-shell')?.getAttribute('aria-busy')==='false')}
const report=[]
try{
  await page.getByRole('button',{name:'文件库',exact:true}).click()
  for(const name of (await fs.readdir(fixtures)).filter(n=>n.endsWith('.md'))){
    const before=await fs.readFile(path.join(fixtures,name),'utf8');await page.locator('.file-row').filter({hasText:name}).click();await page.locator('.cm-editor').waitFor();await page.waitForTimeout(150)
    const formulas=await page.locator('.katex').count();assert(formulas>0)
    const firstMath=page.locator('.node-inline-math,.node-math').first();await firstMath.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/screenshots/v2-math-before.png'});const rect=await firstMath.boundingBox();await firstMath.click();assert(Math.abs((await firstMath.boundingBox()).y-rect.y)<2)
    await command('save');await page.waitForTimeout(100);assert.equal(await fs.readFile(path.join(root,'library',name),'utf8'),before)
    await command('mode-source');assert.equal(await page.locator('.preview-node').count(),0);await command('mode-live');await command('save');assert.equal(await fs.readFile(path.join(root,'library',name),'utf8'),before)
    const text=await page.locator('.cm-content').innerText();const rawMath=text.split(String.fromCharCode(10)).filter(line=>line.trim()==='$$')
    report.push({name,formulas,rawMathDelimiters:rawMath.length,codeLines:await page.locator('.live-code-line').count(),tables:await page.locator('.node-table').count(),imageCount:await page.locator('.node-image').count(),unchanged:true})
    assert.equal(rawMath.length,0,'Standalone formula delimiters must be hidden')
    await command('sidebar-toc');await page.locator('.cm-scroller').evaluate(e=>e.scrollTop=0);await command('theme-dark');await page.screenshot({path:'artifacts/screenshots/v2-'+name+'.png'});await command('sidebar-files')
  }
  for(const theme of ['light','dark','paper']){await command('theme-'+theme);await page.screenshot({path:'artifacts/screenshots/v2-'+theme+'.png'})}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({report,errors,root},null,2))
}finally{await app.close()}
