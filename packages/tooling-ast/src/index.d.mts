export interface TextEdit {start:number;end:number;expected:string;text:string}
export function applyTextEdits(source:string,edits:readonly TextEdit[]):string;
