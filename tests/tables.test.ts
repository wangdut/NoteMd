import { describe, expect, it } from 'vitest'
import { createTable, parseTable, changeTable, serializeTable } from '../src/renderer/src/tables'
describe('table editing', () => {
  it('creates requested dimensions and rejects invalid sizes', () => {
    expect(parseTable(createTable(3, 4)).rows.map(r => r.length)).toEqual([4,4,4,4])
    expect(() => createTable(0, 1)).toThrow(); expect(() => createTable(1, 21)).toThrow()
  })
  it('preserves escaped pipes and alignment while editing rows and columns', () => {
    const source = '| A | B |\n| :---: | ---: |\n| a\\|b | c |'
    expect(parseTable(source).rows[1]).toEqual(['a\\|b', 'c'])
    const next = changeTable(changeTable(source, 'row-after', 1, 0), 'column-before', 1, 1)
    expect(parseTable(next).rows).toEqual([['A','','B'], ['a\\|b','','c'], ['','','']])
    expect(parseTable(next).align).toEqual(['center','left','right'])
    expect(parseTable(changeTable(next,'row-delete',0,0)).rows.length).toBe(3)
    expect(serializeTable(parseTable(source))).toBe(source)
  })
})
