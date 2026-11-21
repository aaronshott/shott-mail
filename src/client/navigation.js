export function accountFilter(accounts, explicit) {
 if(accounts.length===1)return accounts[0].id;
 return accounts.some(account=>account.id===explicit)?explicit:'all';
}

// The hierarchy is presentation only. Server IDs and full paths stay on the
// original Folder objects. Delimiter + path also disambiguate synthetic nodes.
export function buildFolderTree(folders) {
 const nodes=new Map();
 function node(path,delimiter){
  const key=JSON.stringify([delimiter,path]);
  if(nodes.has(key))return nodes.get(key);
  const split=delimiter?path.lastIndexOf(delimiter):-1;
  const label=split<0?path:path.slice(split+delimiter.length)||path;
  const result={key,path,delimiter,label,folder:null,children:[]};
  nodes.set(key,result);
  return result;
 }
 for(const folder of folders)node(folder.path,folder.delimiter||null).folder=folder;
 const roots=[];
 // Map iteration visits any missing ancestors inserted during this pass.
 for(const branch of nodes.values()){
  const split=branch.delimiter?branch.path.lastIndexOf(branch.delimiter):-1;
  if(split>0)node(branch.path.slice(0,split),branch.delimiter).children.push(branch);
  else roots.push(branch);
 }
 return roots;
}
