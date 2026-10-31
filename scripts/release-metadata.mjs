import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'))
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'))
if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('Package and lockfile versions differ')
const { version } = pkg
const directory = path.resolve(pkg.build.directories.output.replaceAll('$' + '{version}', version))
if (path.relative(path.resolve('release'), directory) !== 'NoteMd-' + version) throw new Error('Expected release/NoteMd-<version> output directory')
const portable = 'NoteMd-' + version + '-x64.exe'
const artifactPaths = [portable, 'win-unpacked/NoteMd.exe', 'win-unpacked/resources/app.asar']
const artifacts = []
for (const file of artifactPaths) {
  const absolute = path.join(directory, file)
  const info = await fs.stat(absolute)
  if (!info.isFile() || info.size === 0) throw new Error('Missing or empty release artifact: ' + file)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(absolute)) hash.update(chunk)
  artifacts.push({ file, bytes: info.size, sha256: hash.digest('hex').toUpperCase() })
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim()
const manifest = { product: pkg.productName, version, platform: 'win32', arch: 'x64', builtAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), sourceWorktreeDirty: git('status', '--porcelain').length > 0, artifacts }
const newline = String.fromCharCode(10)
await fs.writeFile(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + newline)
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), artifacts.map(item => item.sha256 + '  ' + item.file).join(newline) + newline)
for (const name of ['CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await fs.copyFile(name, path.join(directory, name))
const readme = [
  '# NoteMd ' + version + ' · Windows x64', '',
  '## 选择运行方式', '',
  '- 单文件便携版：双击 ' + portable + '，无需安装。',
  '- 目录免安装版：双击 win-unpacked/NoteMd.exe，复制或迁移时必须保留整个 win-unpacked 文件夹。',
  '- 两者使用同一版本代码；当前未提供安装向导版。', '',
  '## 文档与设置', '',
  '首次使用默认文档库为 Windows 文档目录下的 NoteMd_Data；已有设置继续沿用原路径。文件菜单可选择其他文档库。便携指程序单文件分发，文档、图片、主题设置和恢复草稿不会自动跟随 EXE 搬移。迁移文档时请携带同级图片目录。', '',
  '## 更新与校验', '',
  'CHANGELOG.md 记录版本变化。SHA256SUMS.txt 包含便携 EXE、目录版 EXE 与 app.asar 的校验值。release-manifest.json 记录构建时间、代码提交与产物信息。', '',
  '保留旧版本目录用于回退；不要只替换目录版中的单个 EXE。', '',
  'Windows 包未签商业代码证书。', '',
].join(newline)
await fs.writeFile(path.join(directory, 'README.md'), readme, 'utf8')
await fs.writeFile(path.resolve('release/README.txt'), [
  'NoteMd 发行目录', '', '当前正式版本：' + version,
  '便携版：NoteMd-' + version + '/' + portable,
  '目录免安装版：NoteMd-' + version + '/win-unpacked/NoteMd.exe', '',
  '两种形式来自同一版本代码。每个正式版本独立保存在 NoteMd-<版本号> 文件夹中。',
  '旧 NoteMd-0.1.0、NoteMd-0.2.0 目录与 archive 内文件仅用于历史回退。',
  '详细用法、更新日志与校验值请查看当前版本目录内 README.md、CHANGELOG.md 和 SHA256SUMS.txt。', '',
].join(newline), 'utf8')
console.log(JSON.stringify({ directory, version, artifacts }))

