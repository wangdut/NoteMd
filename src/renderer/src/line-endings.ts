import type { ChangeDesc, Text } from '@codemirror/state'
export class LineEndings {
  private separators:Map<number,string> = new Map()
  readonly preferred:string
  readonly bom:string
  readonly normalized:string
  constructor(source:string){
    this.bom=source.startsWith('\uFEFF')?'\uFEFF':'';source=source.replace(/^\uFEFF/,'');this.preferred=source.includes('\r\n')?'\r\n':'\n'
    let offset=0,previous=0,normalized=''
    for(const match of source.matchAll(/\r\n|\r|\n/g)){const text=source.slice(previous,match.index);normalized+=text+'\n';offset+=text.length;this.separators.set(offset,match[0]);offset++;previous=match.index!+match[0].length}
    this.normalized=normalized+source.slice(previous)
  }
  update(changes:ChangeDesc,document:Text){
    const next=new Map<number,string>();const removed:Array<[number,number]>=[]
    changes.iterChangedRanges((from,to)=>removed.push([from,to]))
    for(const [position,separator] of this.separators){if(removed.some(([from,to])=>from<=position&&position<to))continue;const mapped=changes.mapPos(position,1);if(document.sliceString(mapped,mapped+1)==='\n')next.set(mapped,separator)}
    this.separators=next
  }
  serialize(document:Text):string{
    let source=this.bom;for(let n=1;n<=document.lines;n++){const line=document.line(n);source+=line.text;if(n<document.lines)source+=this.separators.get(line.to)??this.preferred}return source
  }
}
