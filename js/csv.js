// CSV helpers: support quoted fields, commas, line breaks and UTF-8 BOM.
export function parseCsv(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quoted=false;
      else field+=ch;
    }else if(ch==='"' && field==='')quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(field);field='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[];
    }else field+=ch;
  }
  if(quoted)throw new Error('CSV sadrži nezatvorene navodnike.');
  if(field!==''||row.length){row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row);}
  return rows;
}
const safeCell=value=>{
  let s=String(value??'');
  if(/^[=+@]/.test(s)||(/^\s*-[^0-9]/.test(s)))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
};
export function toCsv(rows,columns){
  const lines=[columns.map(safeCell).join(',')];
  for(const row of rows)lines.push(columns.map(k=>safeCell(row[k])).join(','));
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
export function downloadCsv(filename,content){
  const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=filename;a.hidden=true;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
