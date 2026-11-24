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
