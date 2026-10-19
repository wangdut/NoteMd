import { _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
await fs.mkdir('artifacts/screenshots',{recursive:true});await fs.mkdir('test-results/preview/library',{recursive:true})
await fs.copyFile('examples/欢迎使用.md','test-results/preview/library/欢迎使用.md')
const env={...process.env,NOTEMD_USER_DATA:path.resolve('test-results/preview/profile'),NOTEMD_LIBRARY_PATH:path.resolve('test-results/preview/library')};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({args:['.'],env});const page=await app.firstWindow();await page.waitForSelector('.empty-state')
const command=async name=>{await app.evaluate(({BrowserWindow},v)=>BrowserWindow.getAllWindows()[0].webContents.send('notemd:command',v),name);await page.waitForFunction(()=>document.querySelector('.app-shell').getAttribute('aria-busy')==='false')}
await command('sidebar-files');await page.locator('.file-row').filter({hasText:'欢迎使用.md'}).click();await command('sidebar-toc');await command('mode-read')
await page.waitForSelector('.live-block h1'); await page.mouse.move(1000,100)
for (const theme of ['light','dark','paper']) {await command('theme-'+theme);await page.waitForTimeout(150);await page.screenshot({path:'artifacts/screenshots/'+theme+'.png'})}
await page.locator('.cm-scroller').evaluate(e=>e.scrollTop=650);await page.screenshot({path:'artifacts/screenshots/math-code.png'})
console.log(JSON.stringify({headings:await page.locator('.toc-panel button').count(),math:await page.locator('.katex').count(),tables:await page.locator('table').count(),screenshots:path.resolve('artifacts/screenshots')}))
await app.close()
