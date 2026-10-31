import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
const {version}=JSON.parse(await fs.readFile('package.json','utf8'))
const executable=path.resolve(process.argv[2]??`release/NoteMd-${version}-x64.exe`)
await fs.access(executable)
await fs.mkdir('test-results/portable',{recursive:true})
await fs.mkdir('artifacts/screenshots',{recursive:true})
const root=await fs.mkdtemp(path.resolve('test-results/portable/run-'))
const env={...process.env,NOTEMD_USER_DATA:path.join(root,'profile'),NOTEMD_LIBRARY_PATH:path.join(root,'library'),TEMP:root,TMP:root};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(executable,['--remote-debugging-port=0'],{env,windowsHide:true,stdio:'ignore'})
const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}))})
let port
for(let i=0;i<60;i++){try{port=(await fs.readFile(path.join(root,'profile','DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{}await new Promise(r=>setTimeout(r,500))}
if(!port)throw new Error('Portable app did not create a debugging endpoint')
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const page=browser.contexts()[0].pages()[0]
await page.waitForSelector('.empty-state');await page.locator('.empty-actions button').first().click();await page.waitForSelector('.cm-content');await page.locator('.cm-content').click();await page.keyboard.insertText('# Portable verified');await page.getByRole('button',{name:'保存',exact:true}).click()
await page.waitForFunction(()=>document.querySelector('.save-state').textContent.includes('已保存'));await page.screenshot({path:'artifacts/screenshots/portable-smoke.png'})
const files=await fs.readdir(path.join(root,'library'));const file=files.find(n=>n.endsWith('.md'));const saved=await fs.readFile(path.join(root,'library',file),'utf8');if(saved!=='# Portable verified')throw new Error('Portable save mismatch')
await page.evaluate(()=>window.noteMd.closeReady());await browser.close().catch(()=>{})
let timeout
const result=await Promise.race([exited,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Portable app did not exit within 30 seconds')),30000)})]).finally(()=>clearTimeout(timeout))
if(result.code!==0)throw new Error('Portable app exit failed: '+JSON.stringify(result))
console.log(JSON.stringify({portable:true,executable,saved,root,exitCode:result.code}))
