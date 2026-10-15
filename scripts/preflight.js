'use strict';
const fs=require('fs'); const path=require('path');
const roots=['plugins','plugins2','esportplugin','plugin4'];
const forbidden=new Set(['sudo','pair','clone','gitclone','gitclone2','rent','rentbot','githubdl','githubdl2','paircode','pairingcode']);
const seen=new Map(); const duplicates=[]; const broken=[]; const forbiddenHits=[];
function walk(dir){
  if(!fs.existsSync(dir)) return;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()){ if(['node_modules','.git','tests','test','__tests__','engines','fixtures','coverage','dist','build'].includes(ent.name.toLowerCase())) continue; walk(p); continue; }
    if(!ent.name.endsWith('.js')) continue;
    let src=fs.readFileSync(p,'utf8');
    src=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\s)\/\/.*$/gm,'');
    for(const m of src.matchAll(/command\s*:\s*['\"]([a-z0-9_-]+)['\"]/gi)){
      const c=m[1].toLowerCase();
      if(forbidden.has(c)) forbiddenHits.push([c,p]);
      if(seen.has(c)) duplicates.push([c,seen.get(c),p]); else seen.set(c,p);
    }
    if (/require\(['\"]\.\.\//.test(src) && p.startsWith(path.resolve('plugins')+path.sep)) {}
  }
}
roots.filter(fs.existsSync).forEach(walk);
const tokens=Object.keys(process.env).filter(k=>/^APIFY_TOKEN_\d+$/.test(k)&&process.env[k]);
const ilpEnabled=fs.existsSync(path.resolve('plugins2','ilubpdf.js'));
if(ilpEnabled){const req=['pdf-lib','pdfjs-dist','docx','mammoth','jszip','pptxgenjs','xlsx','@napi-rs/canvas'];const miss=req.filter(m=>{try{require.resolve(m);return false}catch{return true}});console.log('[CHECK] ILP PDF Suite dependencies: '+(miss.length?('MISSING '+miss.join(', ')):'OK'));}
console.log(`[CHECK] command declarations: ${seen.size}`);
console.log(`[CHECK] duplicate command declarations: ${duplicates.length} (resolved by runtime loader; not fatal)`);
console.log(`[CHECK] forbidden command declarations: ${forbiddenHits.length}`);
console.log(`[CHECK] APIFY_TOKEN_n available in process: ${tokens.length}`);
for(const d of duplicates.slice(0,20)) console.log('  DUP',d.join(' | '));
for(const f of forbiddenHits.slice(0,20)) console.log('  FORBIDDEN',f.join(' | '));
if(forbiddenHits.length) process.exitCode=2;
