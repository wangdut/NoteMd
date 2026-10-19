// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {serializeCell} from '../src/renderer/src/tables'
it('keeps inline cell formatting when text changes',()=>{
  const cell=document.createElement('td');cell.innerHTML='<strong>粗体</strong> <span style="color:#2471c8">蓝色新字</span> <span data-markdown="$x^2$">公式渲染</span><br>换行 | 竖线'
  const markdown=serializeCell(cell);expect(markdown).toContain('**粗体**');expect(markdown).toContain('color:rgb(36, 113, 200)');expect(markdown).toContain('$x^2$<br>换行 \\| 竖线');expect(markdown).not.toContain('公式渲染')
})
