export type Alignment = 'left' | 'center' | 'right'
export interface TableData { rows: string[][]; align: Alignment[] }
export function splitRow(line: string): string[] {
  const text = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const cells: string[] = []; let cell = ''; let escaped = false
  for (const char of text) {
    if (char === '|' && !escaped) { cells.push(cell.trim()); cell = '' } else cell += char
    escaped = char === '\\' && !escaped
  }
  cells.push(cell.trim()); return cells
}
export function parseTable(source: string): TableData {
  const lines = source.trim().split('\n')
  const header = splitRow(lines[0] ?? '')
  const align = splitRow(lines[1] ?? '').map<Alignment>(cell => cell.endsWith(':') ? cell.startsWith(':') ? 'center' : 'right' : 'left')
  return { rows: [header, ...lines.slice(2).map(splitRow)].map(row => header.map((_, c) => row[c] ?? '')), align }
}
export function serializeTable(table: TableData): string {
  const row = (cells: string[]) => '| ' + cells.join(' | ') + ' |'
  return [row(table.rows[0]!), row(table.align.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : '---')), ...table.rows.slice(1).map(row)].join('\n')
}
export function createTable(rows: number, columns: number): string {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 100 || columns < 1 || columns > 20) throw new Error('正文行数为 1–100，列数为 1–20。')
  return serializeTable({ rows: [Array.from({ length: columns }, (_, i) => '列 ' + (i + 1)), ...Array.from({ length: rows }, () => Array(columns).fill(''))], align: Array(columns).fill('left') })
}
export function changeTable(source: string, action: string, row: number, column: number): string {
  const data = parseTable(source); row = Math.max(0, Math.min(row, data.rows.length - 1)); column = Math.max(0, Math.min(column, data.align.length - 1))
  if (action === 'row-before' || action === 'row-after') data.rows.splice(Math.max(1, row + (action === 'row-after' ? 1 : 0)), 0, Array(data.align.length).fill(''))
  if (action === 'row-delete' && row > 0) data.rows.splice(row, 1)
  if (action === 'column-before' || action === 'column-after') { const at = column + (action === 'column-after' ? 1 : 0); data.align.splice(at, 0, 'left'); data.rows.forEach(r => r.splice(at, 0, '')) }
  if (action === 'column-delete' && data.align.length > 1) { data.align.splice(column, 1); data.rows.forEach(r => r.splice(column, 1)) }
  if (action.startsWith('align-')) data.align[column] = action.slice(6) as Alignment
  return serializeTable(data)
}
