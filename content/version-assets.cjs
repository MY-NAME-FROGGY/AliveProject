// Run after editing browser assets, before publishing index.html.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
for(const page of ['index.html','mafia/index.html']){
const entry=path.join(root,page);
if(!fs.existsSync(entry))continue;
const html=fs.readFileSync(entry,'utf8').replace(/(src|href)="([^"?:]+\.(?:js|css))(?:\?[^\"]*)?"/g,(match,attribute,file)=>{
  const full=path.resolve(path.dirname(entry),file);
  if(!fs.existsSync(full))throw Error('Missing asset: '+file);
  const version=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0,12);
  return `${attribute}="${file}?v=${version}"`;
});
fs.writeFileSync(entry,html);
}
console.log('Local script and stylesheet URLs versioned by content hash.');
