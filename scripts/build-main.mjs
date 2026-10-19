import { build } from 'esbuild'
await build({ entryPoints: ['src/main/main.ts'], outdir: 'dist/main', bundle: true, platform: 'node', format: 'esm', external: ['electron'], sourcemap: true })
await build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
