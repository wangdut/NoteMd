import { expect,it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { LineEndings } from '../src/renderer/src/line-endings'
it('maps mixed CRLF, LF and BOM without changing untouched separators',()=>{
  const source='\uFEFF# 标题\r\n\r\n普通正文\n\n## 子标题\r\n末尾'
  const endings=new LineEndings(source);let state=EditorState.create({doc:endings.normalized})
  expect(state.doc.lines).toBe(6);expect(endings.serialize(state.doc)).toBe(source)
  const tr=state.update({changes:{from:state.doc.line(3).to,insert:'补充'}});endings.update(tr.changes,tr.state.doc);state=tr.state
  expect(endings.serialize(state.doc)).toBe(source.replace('普通正文','普通正文补充'))
})
