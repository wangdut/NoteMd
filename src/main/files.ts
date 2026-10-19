import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Lexer } from 'marked'

export interface NoteStamp { hash: string; exists: boolean }
export interface LibraryEntry { name: string; path: string; kind: 'file' | 'folder'; modifiedAt: number; size?: number }

const ASSET_FOLDER = /^\d{8}-\d{6}-\d{3}$/
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown'])
const saveQueues = new Map<string, Promise<unknown>>()
async function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = saveQueues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(work)
  saveQueues.set(key, next)
  try { return await next } finally { if (saveQueues.get(key) === next) saveQueues.delete(key) }
}
function validName(name: string): boolean {
  return !!name && !name.startsWith('.') && !/[<>:"|?*\\/\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
}
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'])
const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/bmp': '.bmp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeRelative(relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..' || part === '.')) {
    throw new Error('The requested path is outside the document library.')
  }
  return relative
}

function within(root: string, target: string): boolean {
  const relation = path.relative(root, target)
  return relation === '' || (!relation.startsWith(`..${path.sep}`) && relation !== '..' && !path.isAbsolute(relation))
}

async function resolveInside(root: string, relative: string): Promise<string> {
  const absolute = path.resolve(root, safeRelative(relative))
  if (!within(root, absolute)) throw new Error('The requested path is outside the document library.')
  const parts = path.relative(root, absolute).split(path.sep).filter(Boolean)
  let walk = root
  for (const [index, part] of parts.entries()) {
    walk = path.join(walk, part)
    try {
      const stat = await fs.lstat(walk)
      if (stat.isSymbolicLink()) throw new Error('Symbolic links are not allowed inside the document library.')
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error('A parent path is not a directory.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
      throw error
    }
  }
  return absolute
}

async function isManagedAssetFolder(folder: string): Promise<boolean> {
  if (!ASSET_FOLDER.test(path.basename(folder))) return false
  try {
    if ((await fs.lstat(folder)).isSymbolicLink()) return false
    const marker = JSON.parse(await fs.readFile(path.join(folder, '.notemd-assets.json'), 'utf8'))
    return marker.managedBy === 'NoteMd'
  } catch { return false }
}

async function ensureLibrary(rootPath: string): Promise<string> {
  const root = path.resolve(rootPath)
  await fs.mkdir(root, { recursive: true })
  return fs.realpath(root)
}

export async function listLibrary(rootPath: string, relative = ''): Promise<LibraryEntry[]> {
  const root = await ensureLibrary(rootPath)
  const folder = relative ? await resolveInside(root, relative) : root
  const stat = await fs.lstat(folder)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Choose a valid document-library folder.')
  let order: string[] = []
  try {
    const value = JSON.parse(await fs.readFile(path.join(folder, '.notemd-order.json'), 'utf8'))
    if (Array.isArray(value)) order = value.filter((item): item is string => typeof item === 'string')
  } catch { /* The optional order file may not exist. */ }

  const entries: LibraryEntry[] = []
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const absolute = path.join(folder, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (await isManagedAssetFolder(absolute)) continue
      const info = await fs.stat(absolute)
      entries.push({ name: entry.name, path: path.posix.join(relative.replaceAll('\\', '/'), entry.name), kind: 'folder', modifiedAt: info.mtimeMs })
    } else if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const info = await fs.stat(absolute)
      entries.push({ name: entry.name, path: path.posix.join(relative.replaceAll('\\', '/'), entry.name), kind: 'file', modifiedAt: info.mtimeMs, size: info.size })
    }
  }
  const ranks = new Map(order.map((name, index) => [name, index]))
  return entries.sort((a, b) => (ranks.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.name) ?? Number.MAX_SAFE_INTEGER)
    || (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN') : a.kind === 'folder' ? -1 : 1))
}

async function atomicWrite(target: string, content: string | Buffer, exclusive = false): Promise<void> {
  const temp = `${target}.notemd-${randomUUID()}.tmp`
  const handle = await fs.open(temp, 'wx')
  try { await handle.writeFile(content); await handle.sync() } finally { await handle.close() }
  try {
    if (exclusive) { await fs.link(temp, target); await fs.unlink(temp) }
    else await fs.rename(temp, target)
  } catch (error) { await fs.rm(temp, { force: true }); throw error }
}

export async function readNote(rootPath: string, relative: string): Promise<{ path: string; content: string; stamp: NoteStamp }> {
  const root = await ensureLibrary(rootPath)
  const absolute = await resolveInside(root, relative)
  const stat = await fs.lstat(absolute)
  if (!stat.isFile() || !MARKDOWN_EXTENSIONS.has(path.extname(absolute).toLowerCase())) throw new Error('Select a Markdown document to open.')
  const content = await fs.readFile(absolute, 'utf8')
  return { path: path.relative(root, absolute).split(path.sep).join('/'), content, stamp: { hash: digest(content), exists: true } }
}

export async function saveNote(rootPath: string, relative: string, content: string, expected: NoteStamp): Promise<NoteStamp> {
  return serialized(path.resolve(rootPath, relative).toLowerCase(), () => saveNoteUnqueued(rootPath, relative, content, expected))
}
async function saveNoteUnqueued(rootPath: string, relative: string, content: string, expected: NoteStamp): Promise<NoteStamp> {
  const root = await ensureLibrary(rootPath)
  const absolute = await resolveInside(root, relative)
  if (!MARKDOWN_EXTENSIONS.has(path.extname(absolute).toLowerCase())) throw new Error('Only Markdown documents can be saved here.')
  let currentExists = true
  let current = ''
  try { current = await fs.readFile(absolute, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    currentExists = false
  }
  if (currentExists !== expected.exists || (currentExists && digest(current) !== expected.hash)) {
    throw new Error('This document changed on disk. Your edits are kept in the editor; reload or save a copy before replacing it.')
  }
  await atomicWrite(absolute, content, !currentExists)
  return { hash: digest(content), exists: true }
}

export async function createNote(rootPath: string, folderRelative = ''): Promise<{ path: string; content: string; stamp: NoteStamp }> {
  const root = await ensureLibrary(rootPath)
  const folder = folderRelative ? await resolveInside(root, folderRelative) : root
  if (!(await fs.stat(folder)).isDirectory()) throw new Error('Choose a document-library folder.')
  const now = new Date()
  const prefix = `新建文档-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  for (let i = 1; i <= 999; i++) {
    const name = `${prefix}-${String(i).padStart(3, '0')}.md`
    const relative = path.posix.join(folderRelative.replaceAll('\\', '/'), name)
    try { await atomicWrite(path.join(folder, name), '', true); return { path: relative, content: '', stamp: { hash: digest(''), exists: true } } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  throw new Error('Could not allocate a unique document name.')
}

export async function createFolder(rootPath: string, parentRelative: string, name: string): Promise<string> {
  const folderName = name.trim()
  if (!validName(folderName)) {
    throw new Error('Use a folder name without path separators, hidden names, or Windows-reserved characters.')
  }
  const root = await ensureLibrary(rootPath)
  const parent = parentRelative ? await resolveInside(root, parentRelative) : root
  if (!(await fs.stat(parent)).isDirectory()) throw new Error('Choose a document-library folder.')
  const target = path.join(parent, folderName)
  await fs.mkdir(target)
  return path.relative(root, target).split(path.sep).join('/')
}

async function createAssetFolder(parent: string, now = new Date()): Promise<string> {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  for (let i = 1; i <= 999; i++) {
    const folder = path.join(parent, `${stamp}-${String(i).padStart(3, '0')}`)
    try {
      await fs.mkdir(folder)
      try { await atomicWrite(path.join(folder, '.notemd-assets.json'), JSON.stringify({ managedBy: 'NoteMd', createdAt: now.toISOString() }, null, 2)) }
      catch (error) { await fs.rm(folder, { recursive: true, force: true }); throw error }
      return folder
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  throw new Error('Could not allocate a unique image folder.')
}

function managedFolderFromMarkdown(markdown: string, parent: string): string | null {
  const pattern = /!?\[[^\]]*\]\(\s*<?([^\s)>]+)>?/g
  for (const match of markdown.matchAll(pattern)) {
    const reference = match[1]
    if (!reference || /^[a-z][a-z\d+.-]*:/i.test(reference)) continue
    let decoded: string
    try { decoded = decodeURIComponent(reference.split(/[?#]/, 1)[0]!) } catch { continue }
    const parts = decoded.split(/[\\/]/)
    if (parts.length === 2 && ASSET_FOLDER.test(parts[0]!)) return path.join(parent, parts[0]!)
  }
  return null
}

function encodedRelativePath(folder: string, file: string): string {
  return [folder, file].filter(Boolean).flatMap(item => item.split(/[\\/]/).filter(Boolean)).map(encodeURIComponent).join('/')
}

export async function importImages(rootPath: string, relative: string, content: string, images: Array<{ name: string; mimeType: string; bytes: Uint8Array }>): Promise<{ paths: string[]; markdown: string }> {
  return serialized('images:' + path.resolve(rootPath, relative).toLowerCase(), () => importImagesUnqueued(rootPath, relative, content, images))
}
async function importImagesUnqueued(rootPath: string, relative: string, content: string, images: Array<{ name: string; mimeType: string; bytes: Uint8Array }>): Promise<{ paths: string[]; markdown: string }> {
  if (!images.length) return { paths: [], markdown: '' }
  const root = await ensureLibrary(rootPath)
  const note = await resolveInside(root, relative)
  if (!MARKDOWN_EXTENSIONS.has(path.extname(note).toLowerCase())) throw new Error('Save a Markdown document before adding images.')
  for (const image of images) {
    if (!MIME_EXTENSION[image.mimeType] || image.bytes.byteLength > 25 * 1024 * 1024) throw new Error('Unsupported image format or image exceeds 25 MB.')
  }
  let assetFolder = managedFolderFromMarkdown(content, path.dirname(note))
  if (assetFolder && !(await isManagedAssetFolder(assetFolder))) assetFolder = null
  let created = false
  if (!assetFolder) { assetFolder = await createAssetFolder(path.dirname(note)); created = true }

  const files: string[] = []
  const links: string[] = []
  try {
    const siblings = await fs.readdir(assetFolder)
    for (const [index, image] of images.entries()) {
      const ext = MIME_EXTENSION[image.mimeType]!
      const stem = path.basename(image.name, path.extname(image.name)).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `图片-${index + 1}`
      let serial = 1
      let name: string
      do { name = `${stem}-${String(serial++).padStart(3, '0')}${ext}` } while (siblings.includes(name))
      const target = path.join(assetFolder, name)
      await atomicWrite(target, Buffer.from(image.bytes), true)
      files.push(target)
      siblings.push(name)
      links.push(`![${image.name.replace(/[\[\]\\\r\n]/g, '')}](${encodedRelativePath(path.basename(assetFolder), name)})`)
    }
  } catch (error) {
    await Promise.all(files.map(file => fs.rm(file, { force: true })))
    if (created) await fs.rm(assetFolder, { recursive: true, force: true })
    throw error
  }
  return { paths: files, markdown: links.join('\n') }
}

function imageDestinations(markdown: string): Array<{ start: number; end: number; reference: string }> {
  const output: Array<{ start: number; end: number; reference: string }> = []
  const excluded: Array<[number, number]> = []
  let offset = 0
  for (const token of Lexer.lex(markdown.replaceAll('\r\n', '\n'))) {
    const raw = markdown.includes('\r\n') ? token.raw.replaceAll('\n', '\r\n') : token.raw
    const from = markdown.indexOf(raw, offset)
    if (from < 0) continue
    offset = from + raw.length
    if (token.type === 'code') excluded.push([from, offset])
  }
  for (const match of markdown.matchAll(/(`+)([^`]|(?!\1)`)*?\1/g)) excluded.push([match.index!, match.index! + match[0].length])
  const pattern = /!\[(?:\\.|[^\]\\])*\]\(\s*(?:<([^>]+)>|((?:\\.|[^()\s]|\([^()]*\))+))[^)]*\)/gd
  for (const match of markdown.matchAll(pattern)) {
    const ref = match[1] ?? match[2]
    if (!ref) continue
    const start = match.indices![1]?.[0] ?? match.indices![2]![0]
    output.push({ start, end: start + ref.length, reference: ref })
  }
  // Reference-style images and HTML images are portable too. Exact indices
  // prevent an alt label containing the same path from being rewritten.
  for (const pattern of [/^ {0,3}\[[^\]]+\]:[ \t]*(?:<([^>]+)>|([^\s]+))/gmd, /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gdi]) {
    for (const match of markdown.matchAll(pattern)) {
      const ref = match[1] ?? match[2]; if (!ref) continue
      const start = match.indices![1]?.[0] ?? match.indices![2]![0]
      output.push({ start, end: start + ref.length, reference: ref })
    }
  }
  return output.filter(item => !excluded.some(([from, to]) => item.start >= from && item.start < to))
}

async function portableMarkdown(root: string, source: string, target: string, markdown: string): Promise<{ content: string; assetFolder: string | null }> {
  let assetFolder: string | null = null
  const replacements: Array<{ start: number; end: number; text: string }> = []
  const copiedImages = new Map<string, string>()
  try {
    for (const image of imageDestinations(markdown)) {
      if (/^(?:[a-z][a-z\d+.-]*:|[/]{2}|#)/i.test(image.reference)) continue
      let decoded: string
      try { decoded = decodeURIComponent(image.reference.split(/[?#]/, 1)[0]!) } catch { continue }
      const original = path.resolve(path.dirname(source), decoded.replaceAll('/', path.sep))
      if (!within(root, original) || !IMAGE_EXTENSIONS.has(path.extname(original).toLowerCase())) continue
      await resolveInside(root, path.relative(root, original))
      let stat
      try { stat = await fs.lstat(original) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25 * 1024 * 1024) continue
      let replacement = copiedImages.get(original)
      if (!replacement) {
        if (!assetFolder) assetFolder = await createAssetFolder(path.dirname(target))
        const base = path.basename(original); let copied = path.join(assetFolder, base); let n = 1
        while (await fs.access(copied).then(() => true, () => false)) copied = path.join(assetFolder, `${path.parse(base).name}-${n++}${path.extname(base)}`)
        await fs.copyFile(original, copied, 1)
        replacement = encodedRelativePath(path.basename(assetFolder), path.basename(copied))
        copiedImages.set(original, replacement)
      }
      replacements.push({ start: image.start, end: image.end, text: replacement })
    }
    let content = markdown
    for (const item of replacements.sort((a, b) => b.start - a.start)) content = content.slice(0, item.start) + item.text + content.slice(item.end)
    return { content, assetFolder }
  } catch (error) {
    if (assetFolder) await fs.rm(assetFolder, { recursive: true, force: true })
    throw error
  }
}

export async function copyNote(rootPath: string, relative: string, targetRoot: string, targetRelative: string, markdown: string, expected: NoteStamp): Promise<{ path: string; content: string; stamp: NoteStamp }> {
  const root = await ensureLibrary(rootPath)
  const source = await resolveInside(root, relative)
  const destinationRoot = await ensureLibrary(targetRoot)
  const target = await resolveInside(destinationRoot, targetRelative)
  const result = path.dirname(source) === path.dirname(target) ? { content: markdown, assetFolder: null } : await portableMarkdown(root, source, target, markdown)
  try {
    const stamp = await saveNote(destinationRoot, targetRelative, result.content, expected)
    return { path: targetRelative, content: result.content, stamp }
  } catch (error) { if (result.assetFolder) await fs.rm(result.assetFolder, { recursive: true, force: true }); throw error }
}

export async function libraryItemPath(rootPath: string, relative: string): Promise<string> {
  const root = await ensureLibrary(rootPath)
  const target = await resolveInside(root, relative)
  await fs.lstat(target)
  return target
}
export async function managedAssetFolders(rootPath: string, relative: string): Promise<string[]> {
  const note = await libraryItemPath(rootPath, relative)
  const content = await fs.readFile(note, 'utf8')
  const folders = new Set<string>()
  for (const image of imageDestinations(content)) {
    let decoded: string
    try { decoded = decodeURIComponent(image.reference) } catch { continue }
    const first = decoded.split('/')[0]!
    if (!ASSET_FOLDER.test(first)) continue
    const folder = path.join(path.dirname(note), first)
    if (await isManagedAssetFolder(folder)) folders.add(folder)
  }
  return [...folders]
}

export async function renameEntry(rootPath: string, relative: string, newName: string): Promise<string> {
  const requested = newName.trim()
  if (!validName(requested)) throw new Error('Enter a valid file or folder name.')
  const root = await ensureLibrary(rootPath)
  const source = await resolveInside(root, relative)
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error('Symbolic links cannot be renamed from the library.')
  const name = stat.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(source).toLowerCase()) && path.extname(requested) === '' ? `${requested}${path.extname(source)}` : requested
  if (stat.isFile() && !MARKDOWN_EXTENSIONS.has(path.extname(name).toLowerCase())) throw new Error('文档需要保留 Markdown 扩展名。')
  const target = path.join(path.dirname(source), name)
  if (source === target) return path.relative(root, target).split(path.sep).join('/')
  try { await fs.access(target); throw new Error('An item with that name already exists.') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await fs.rename(source, target)
  return path.relative(root, target).split(path.sep).join('/')
}

export async function moveEntry(rootPath: string, relative: string, destinationRelative = ''): Promise<string> {
  const root = await ensureLibrary(rootPath)
  const source = await resolveInside(root, relative)
  const folder = destinationRelative ? await resolveInside(root, destinationRelative) : root
  const sourceInfo = await fs.lstat(source)
  const folderInfo = await fs.lstat(folder)
  if (sourceInfo.isSymbolicLink() || !folderInfo.isDirectory() || folderInfo.isSymbolicLink()) throw new Error('Choose a regular file and folder destination.')
  if (sourceInfo.isDirectory() && within(source, folder)) throw new Error('A folder cannot be moved inside itself.')
  if (path.resolve(path.dirname(source)) === path.resolve(folder)) return path.relative(root, source).split(path.sep).join('/')
  const target = path.join(folder, path.basename(source))
  try { await fs.access(target); throw new Error('An item with that name already exists.') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }

  if (sourceInfo.isDirectory()) {
    // Relative assets inside the directory retain their location when moved.
    // Reject external relative assets until they can be migrated transactionally.
    async function inspect(folder: string): Promise<void> {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const absolute = path.join(folder, entry.name)
        if (entry.isSymbolicLink()) throw new Error('目录含符号链接，不能直接移动。')
        if (entry.isDirectory()) await inspect(absolute)
        else if (MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          for (const image of imageDestinations(await fs.readFile(absolute, 'utf8'))) {
            if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(image.reference)) continue
            let decoded: string
            try { decoded = decodeURIComponent(image.reference) } catch { continue }
            if (!within(source, path.resolve(folder, decoded))) throw new Error('目录内文档引用了目录外图片，请先单独移动该文档以携带图片。')
          }
        }
      }
    }
    await inspect(source)
    await fs.rename(source, target)
  } else if (MARKDOWN_EXTENSIONS.has(path.extname(source).toLowerCase())) {
    const result = await portableMarkdown(root, source, target, await fs.readFile(source, 'utf8'))
    let created = false
    try {
      await atomicWrite(target, result.content, true); created = true
      await fs.unlink(source)
    } catch (error) {
      if (created) await fs.rm(target, { force: true })
      if (result.assetFolder) await fs.rm(result.assetFolder, { recursive: true, force: true })
      throw error
    }
  } else throw new Error('Only Markdown documents can be moved here.')
  return path.relative(root, target).split(path.sep).join('/')
}

export async function reorderEntries(rootPath: string, relative: string, names: string[]): Promise<void> {
  const root = await ensureLibrary(rootPath)
  const folder = relative ? await resolveInside(root, relative) : root
  const current = await listLibrary(root, relative)
  const known = new Set(current.map(entry => entry.name))
  if (names.length !== current.length || names.some(name => !known.has(name)) || new Set(names).size !== names.length) throw new Error('The library list changed. Refresh it before sorting.')
  await atomicWrite(path.join(folder, '.notemd-order.json'), JSON.stringify(names, null, 2))
}

export async function deleteEntry(rootPath: string, relative: string): Promise<void> {
  const root = await ensureLibrary(rootPath)
  const target = await resolveInside(root, relative)
  if (target === root) throw new Error('The document library itself cannot be deleted here.')
  const stat = await fs.lstat(target)
  if (stat.isSymbolicLink()) throw new Error('Symbolic links cannot be deleted from the library.')
  await fs.rm(target, { recursive: stat.isDirectory(), force: false })
}

export async function resolveImageDataUrl(notePath: string, reference: string): Promise<string> {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) throw new Error('Only local document images can be resolved.')
  let decoded: string
  try { decoded = decodeURIComponent(reference.split(/[?#]/, 1)[0]!) } catch { throw new Error('Invalid image path.') }
  const parent = await fs.realpath(path.dirname(notePath))
  const target = path.resolve(parent, decoded.replaceAll('/', path.sep))
  if (!within(parent, target) || !IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error('Image path is outside the document folder.')
  const realTarget = await fs.realpath(target)
  if (!within(parent, realTarget)) throw new Error('Image path is outside the document folder.')
  const stat = await fs.lstat(realTarget)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25 * 1024 * 1024) throw new Error('Image is missing or exceeds 25 MB.')
  const bytes = await fs.readFile(realTarget)
  const mime = path.extname(target).toLowerCase() === '.jpeg' ? 'image/jpeg' : Object.entries(MIME_EXTENSION).find(([, extension]) => extension === path.extname(target).toLowerCase())?.[0] ?? 'application/octet-stream'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

export const helpersForTests = { digest, managedFolderFromMarkdown, isManagedAssetFolder, safeRelative }
