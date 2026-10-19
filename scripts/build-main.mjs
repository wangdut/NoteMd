import { build } from 'esbuild'
import { promises as fs } from 'node:fs'
import path from 'node:path'
await build({ entryPoints: ['src/main/main.ts'], outdir: 'dist/main', bundle: true, platform: 'node', format: 'esm', external: ['electron'], sourcemap: true })
await build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
await fs.mkdir('dist/renderer/assets', { recursive: true })
await fs.copyFile('node_modules/katex/dist/katex.min.css', 'dist/renderer/assets/export-katex.css')
for (const name of await fs.readdir('node_modules/katex/dist/fonts')) await fs.copyFile(path.join('node_modules/katex/dist/fonts', name), path.join('dist/renderer/assets', name))
