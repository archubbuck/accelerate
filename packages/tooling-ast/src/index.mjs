import ts from 'typescript';
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

export function parseSource(fileName,source){
 if(typeof fileName!=='string'||typeof source!=='string'||! /\.[cm]?[jt]sx?$/.test(fileName))throw new Error('UNSUPPORTED_SOURCE');
 const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true);
 const diagnostics=ast.parseDiagnostics.map(d=>({code:d.code,start:d.start??0,length:d.length??0,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
 return {ast,diagnostics};
}
export function findNodes(root,predicate){
 const matches=[];
 function visit(node){if(predicate(node))matches.push(node);ts.forEachChild(node,visit);}
 visit(root);return matches;
}
export function transformSource(fileName,source,edits){
 if(parseSource(fileName,source).diagnostics.length)throw new Error('SOURCE_PARSE_ERROR');
 const result=applyTextEdits(source,edits);
 if(parseSource(fileName,result).diagnostics.length)throw new Error('TRANSFORM_PARSE_ERROR');
 return result;
}

/** Add a named value import without rewriting existing declarations. */
export function ensureNamedImport(fileName,source,{moduleSpecifier,imported,local=imported}){
 const {ast,diagnostics}=parseSource(fileName,source);
 if(diagnostics.length)throw new Error('SOURCE_PARSE_ERROR');
 if(typeof moduleSpecifier!=='string'||!moduleSpecifier||![imported,local].every(n=>typeof n==='string'&&/^[A-Za-z_$][\w$]*$/.test(n)))throw new Error('INVALID_IMPORT');
 for(const statement of ast.statements){
  if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue;
  const clause=statement.importClause;
  if(statement.moduleSpecifier.text===moduleSpecifier&&!clause?.isTypeOnly&&clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)){
   for(const element of clause.namedBindings.elements){
    if(!element.isTypeOnly&&element.name.text===local&&(element.propertyName??element.name).text===imported)return source;
   }
  }
 }
 // Conservative collision detection: reject any existing identifier with the proposed local name.
 if(findNodes(ast,n=>ts.isIdentifier(n)&&n.text===local).length)throw new Error('IMPORT_BINDING_CONFLICT');
 const newline=source.includes('\r\n')?'\r\n':'\n';
 const declaration='import { '+imported+(local===imported?'':' as '+local)+' } from '+JSON.stringify(moduleSpecifier)+';'+newline;
 // Append after the last import or directive, preserving shebangs and leading comments.
 let offset=ast.statements[0]?.getStart(ast)??source.length;
 for(const statement of ast.statements){
  if(ts.isImportDeclaration(statement)||(ts.isExpressionStatement(statement)&&ts.isStringLiteral(statement.expression)))offset=statement.end;
  else break;
 }
 const prefix=offset>0&&!/[\r\n]$/.test(source.slice(0,offset))?newline:'';
 return transformSource(fileName,source,[{start:offset,end:offset,expected:'',text:prefix+declaration}]);
}

/** Resolve references within an explicitly supplied virtual TypeScript project. */
export function findSymbolReferences(files,fileName,position){
 const normalize=n=>n.replace(/\\/g,'/');
 const sources=new Map(Object.entries(files).map(([n,s])=>[normalize(n),s]));
 const options={noLib:true,noResolve:false,target:ts.ScriptTarget.Latest,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler};
 const host={
  getSourceFile(n){const s=sources.get(normalize(n));return s===undefined?undefined:ts.createSourceFile(n,s,options.target,true);},
  getDefaultLibFileName:()=>'',writeFile(){},getCurrentDirectory:()=>'/',
  directoryExists:n=>n==='/'||[...sources.keys()].some(f=>f.startsWith(normalize(n).replace(/\/$/,'')+'/')),getDirectories:()=>[],fileExists:n=>sources.has(normalize(n)),readFile:n=>sources.get(normalize(n)),
  getCanonicalFileName:normalize,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n'
 };
 const program=ts.createProgram([...sources.keys()],options,host),checker=program.getTypeChecker();
 const source=program.getSourceFile(fileName);
 if(!source||!Number.isInteger(position)||position<0||position>=source.text.length)throw new Error('INVALID_SYMBOL_POSITION');
 const identifier=findNodes(source,n=>ts.isIdentifier(n)&&n.getStart(source)<=position&&position<n.end)[0];
 const symbol=identifier&&checker.getSymbolAtLocation(identifier);
 if(!symbol)return {references:[],resolved:false,complete:false};
 const canonical=s=>s&&(s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s);
 const target=canonical(symbol),references=[];
 if(!target?.declarations?.length)return {references,resolved:false,complete:false};
 for(const sf of program.getSourceFiles()){
  for(const n of findNodes(sf,ts.isIdentifier)){
   if(canonical(checker.getSymbolAtLocation(n))===target)references.push({fileName:sf.fileName,start:n.getStart(sf),end:n.end,text:n.text});
  }
 }
 return {references,resolved:true,complete:false};
}
