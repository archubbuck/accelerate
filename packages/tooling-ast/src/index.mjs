// Apply nonoverlapping AST-derived text edits without reprinting unrelated source.
export function applyTextEdits(source,edits){
 const ordered=[...edits].sort((a,b)=>a.start-b.start||a.end-b.end);
 let cursor=0,result='';
 for(const edit of ordered){
  if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||edit.start<cursor||edit.end<edit.start||edit.end>source.length||typeof edit.text!=='string'||source.slice(edit.start,edit.end)!==edit.expected)throw new Error('INVALID_OR_STALE_TEXT_EDIT');
  result+=source.slice(cursor,edit.start)+edit.text;
  cursor=edit.end;
 }
 return result+source.slice(cursor);
}
