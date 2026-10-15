'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
let suiteCache = null;
function suite() { if (!suiteCache) suiteCache = require('./pdfsuite/src/index.cjs'); return suiteCache; }

const MIME_EXT = new Map([
  ['application/pdf','pdf'], ['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp'],
  ['application/zip','zip'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation','pptx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx'],
  ['text/html','html'], ['text/plain','txt'], ['text/markdown','md'], ['application/json','json'],
]);

function unwrap(content) {
  let c = content || {};
  if (c.ephemeralMessage?.message) c = c.ephemeralMessage.message;
  if (c.viewOnceMessage?.message) c = c.viewOnceMessage.message;
  if (c.viewOnceMessageV2?.message) c = c.viewOnceMessageV2.message;
  return c;
}
function currentOrQuoted(message) {
  const current = unwrap(message?.message);
  if (current?.imageMessage || current?.documentMessage) return { key: message.key, message: current };
  const ctx = message?.message?.extendedTextMessage?.contextInfo || {};
  if (!ctx.quotedMessage) return null;
  return { key: { remoteJid: message.key.remoteJid, fromMe:false, id:ctx.stanzaId, participant:ctx.participant }, message: ctx.quotedMessage };
}
function mediaExt(media, image=false) {
  const fromName = media?.fileName && path.extname(media.fileName).slice(1).toLowerCase();
  if (fromName) return fromName;
  const mime = String(media?.mimetype || '').toLowerCase();
  return MIME_EXT.get(mime) || (image ? 'jpg' : (mime.split('/')[1] || 'bin'));
}
async function extractZip(zipPath, workDir) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const out=[];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const safe=path.basename(name).replace(/[^A-Za-z0-9._-]/g,'_');
    if (!safe) continue;
    const dest=path.join(workDir,'zip-'+safe);
    fs.writeFileSync(dest, await entry.async('nodebuffer'));
    out.push(dest);
  }
  return out;
}
async function getInput(message, workDir) {
  const target=currentOrQuoted(message);
  if (!target) throw new Error('Reply to a PDF/file/image or attach a file with the command.');
  const c=unwrap(target.message);
  const media=c?.imageMessage || c?.documentMessage;
  if (!media) throw new Error('Unsupported attachment.');
  const buf=await downloadMediaMessage(target,'buffer',{}, { logger: undefined, reuploadRequest: undefined });
  const ext=mediaExt(media, !!c.imageMessage);
  const input=path.join(workDir,'input-'+Date.now()+'.'+ext);
  fs.writeFileSync(input,buf);
  const zipFiles=ext==='zip' ? await extractZip(input,workDir) : [];
  return {target,input,ext,zipFiles};
}
function parseFlags(args=[]) {
  const aliases=new Map([
    ['-o','output'],['--output','output'],['--pages','pages'],['-p','pages'],['--level','level'],['--order','order'],['--delete','delete'],['--prefix','prefix'],
    ['--angle','angle'],['--position','position'],['--format','format'],['--scale','scale'],['--margin','margin'],['--find','find'],['--text','text'],['--opacity','opacity'],
    ['--to','to'],['--sentences','sentences'],['--title','title'],['--author','author'],['--user-password','userPassword'],['--owner-password','ownerPassword'],['--password','password'],
    ['--image','image'],['--page','page'],['--flatten','flatten'],['--list','list'],['--spec','spec'],['--sheet','sheet'],['--orientation','orientation'],
    ['--x','x'],['--y','y'],['--width','width'],['--weight','weight'],['--color','color'],['--fill','fill'],['--pagesize','pagesize'],
    ['--no-printing','printing'],['--no-copying','copying'],['--no-modifying','modifying']
  ]);
  const multi=new Set(['text','title','author','find','userPassword','ownerPassword','password','fill','spec']);
  const positional=[]; const opts={};
  for(let i=0;i<args.length;i++){
    const a=String(args[i]);
    if(aliases.has(a)){
      const k=aliases.get(a);
      if(['flatten','list','printing','copying','modifying'].includes(k) && (!args[i+1] || String(args[i+1]).startsWith('-'))){ opts[k]=(k==='printing'||k==='copying'||k==='modifying')?false:true; continue; }
      let v=args[++i] ?? '';
      if(multi.has(k)){
        const more=[]; while(i+1<args.length && !String(args[i+1]).startsWith('-')) more.push(args[++i]);
        if(more.length) v=[v,...more].join(' ');
      }
      opts[k]=v; continue;
    }
    if(a.startsWith('--') && a.includes('=')){
      const [k,...r]=a.slice(2).split('='); opts[k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=r.join('='); continue;
    }
    positional.push(a);
  }
  return {opts,positional};
}
function numbers(o){
  for(const k of ['level','angle','scale','margin','opacity','page','x','y','width','sentences']) if(o[k]!==undefined) o[k]=Number(o[k]);
  return o;
}
function primary(command, files){
  const e=f=>path.extname(f).toLowerCase();
  if(['ilpsplit','ilporganize','ilpcompress','ilprepair','ilppdf2word','ilppdf2pptx','ilppdf2excel','ilppdf2jpg','ilppdfa','ilppdf2md','ilpocr','ilpextracttext','ilpextractimages','ilpedit','ilpwatermark','ilprotate','ilppagenumbers','ilpcrop','ilpredact','ilpsign','ilpforms','ilpprotect','ilpunlock','ilpsummarize','ilptranslate'].includes(command)) return files.find(f=>e(f)==='.pdf');
  if(command==='ilpword2pdf') return files.find(f=>['.docx','.doc'].includes(e(f)));
  if(command==='ilppptx2pdf') return files.find(f=>['.pptx','.ppt'].includes(e(f)));
  if(command==='ilpexcel2pdf') return files.find(f=>['.xlsx','.xls'].includes(e(f)));
  if(command==='ilphtml2pdf') return files.find(f=>['.html','.htm'].includes(e(f)));
}
function inlineJson(value, workDir, filename){ try{JSON.parse(value);}catch{return null;} const p=path.join(workDir,filename); fs.writeFileSync(p,value); return p; }
async function zipDir(dir,out){ const z=new JSZip(); for(const f of fs.readdirSync(dir)){ const p=path.join(dir,f); if(fs.statSync(p).isFile()) z.file(f,fs.readFileSync(p)); } fs.writeFileSync(out,await z.generateAsync({type:'nodebuffer',compression:'DEFLATE'})); }
function mime(file){ const e=path.extname(file).toLowerCase(); return ({'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.zip':'application/zip','.md':'text/markdown','.txt':'text/plain'}[e]) || 'application/octet-stream'; }
async function sendFile(sock,jid,file,quoted,caption){ if(fs.statSync(file).size>45*1024*1024) throw new Error('Output exceeds 45 MB.'); return sock.sendMessage(jid,{document:fs.readFileSync(file),mimetype:mime(file),fileName:path.basename(file),caption},{quoted}); }

const SPECS={
 ilpmerge:['merge','merged.pdf','file'], ilpsplit:['split','split','dir'], ilporganize:['organize','organized.pdf','file'], ilpcompress:['compress','compressed.pdf','file'], ilprepair:['repair','repaired.pdf','file'],
 ilppdf2word:['pdf-to-word','converted.docx','file'], ilpword2pdf:['word-to-pdf','converted.pdf','file'], ilppdf2pptx:['pdf-to-pptx','converted.pptx','file'], ilppptx2pdf:['pptx-to-pdf','converted.pdf','file'],
 ilppdf2excel:['pdf-to-excel','converted.xlsx','file'], ilpexcel2pdf:['excel-to-pdf','converted.pdf','file'], ilppdf2jpg:['pdf-to-jpg','pages','dir'], ilpjpg2pdf:['jpg-to-pdf','images.pdf','file'],
 ilphtml2pdf:['html-to-pdf','converted.pdf','file'], ilppdfa:['pdf-to-pdfa','archival.pdf','file'], ilppdf2md:['pdf-to-markdown','converted.md','file'], ilpocr:['ocr','searchable.pdf','file'],
 ilpextracttext:['extract-text','extracted.txt','file'], ilpextractimages:['extract-images','images','dir'], ilpedit:['edit','edited.pdf','file'], ilpwatermark:['watermark','watermarked.pdf','file'],
 ilprotate:['rotate','rotated.pdf','file'], ilppagenumbers:['pagenumbers','numbered.pdf','file'], ilpcrop:['crop','cropped.pdf','file'], ilpredact:['redact','redacted.pdf','file'], ilpsign:['sign','signed.pdf','file'],
 ilpforms:['forms','filled.pdf','file'], ilpprotect:['protect','protected.pdf','file'], ilpunlock:['unlock','unlocked.pdf','file'], ilpcompare:['compare','diff-report.md','file'], ilpsummarize:['summarize','summary.md','file'], ilptranslate:['translate','translated.txt','file'], ilpworkflow:['workflow',null,'auto']
};

async function runTool(command,sock,message,args,context={}){
  const spec=SPECS[command]; if(!spec) throw new Error('Unknown ILP command.');
  const jid=context.chatId||message.key.remoteJid; const work=await fs.promises.mkdtemp(path.join(os.tmpdir(),'abix-ilp-'));
  try{
    const got=await getInput(message,work); const parsed=parseFlags(args); let files=got.ext==='zip'?got.zipFiles:[got.input];
    const pdfs=files.filter(f=>path.extname(f).toLowerCase()==='.pdf'); const images=files.filter(f=>['.jpg','.jpeg','.png','.webp'].includes(path.extname(f).toLowerCase())); const jsons=files.filter(f=>path.extname(f).toLowerCase()==='.json');
    let inputs=[got.ext==='zip'?(primary(command,files)||pdfs[0]||images[0]||files[0]):got.input]; let options=numbers({...parsed.opts}); options.output=options.output||path.join(work,spec[1]||'result.out');
    if(command==='ilpmerge'){ if(got.ext==='zip'){if(pdfs.length<2) throw new Error('ZIP must contain at least 2 PDFs.'); inputs=pdfs;} }
    if(command==='ilpcompare'){ if(got.ext!=='zip'||pdfs.length!==2) throw new Error('Reply to a ZIP containing exactly 2 PDFs for compare.'); inputs=pdfs; }
    if(command==='ilpjpg2pdf'){ if(got.ext==='zip'){if(!images.length) throw new Error('ZIP must contain images.'); inputs=[images];} }
    if(command==='ilpedit'){
      let specFile=got.ext==='zip'?jsons[0]:null; if(!specFile&&parsed.opts.spec) specFile=inlineJson(parsed.opts.spec,work,'edit-spec.json'); if(!specFile&&parsed.positional.length) specFile=inlineJson(parsed.positional.join(' '),work,'edit-spec.json'); if(!specFile) throw new Error('Provide JSON edit spec.'); inputs=[pdfs[0]||got.input,specFile];
    }
    if(command==='ilpsign'){ if(images[0]) options.image=images[0]; if(got.ext==='zip') inputs=[pdfs[0]||got.input]; if(!options.image&&!options.text) throw new Error('Provide --text or include a signature image in the ZIP.'); }
    if(command==='ilpforms'){ if(jsons[0]&&!options.fill&&!options.list) options.fill=jsons[0]; if(parsed.positional.length&&!options.fill) options.fill=inlineJson(parsed.positional.join(' '),work,'form-data.json')||parsed.positional.join(' '); if(got.ext==='zip') inputs=[pdfs[0]||got.input]; }
    if(command==='ilpworkflow'){
      let wf=got.ext==='zip'?(jsons.find(f=>/workflow|flow/i.test(path.basename(f)))||jsons[0]):got.input; if(!wf&&parsed.positional.length) wf=inlineJson(parsed.positional.join(' '),work,'workflow-inline.json'); if(!wf) throw new Error('Provide workflow JSON.');
      const obj=JSON.parse(fs.readFileSync(wf,'utf8')); for(const step of obj.steps||[]){ const resolve=v=>typeof v==='string'&&!path.isAbsolute(v)?(files.find(f=>path.basename(f).toLowerCase()===path.basename(v).toLowerCase())||path.join(work,path.basename(v))):v; if(Array.isArray(step.input)) step.input=step.input.map(resolve); else if(step.input) step.input=resolve(step.input); if(step.output&&!path.isAbsolute(step.output)) step.output=path.join(work,path.basename(step.output)); }
      const prepared=path.join(work,'workflow-prepared.json'); fs.writeFileSync(prepared,JSON.stringify(obj,null,2)); const result=await suite().workflow.action(prepared); const outFiles=fs.readdirSync(work).filter(f=>/^(?!input-|zip-|workflow).+\.(pdf|docx|pptx|xlsx|txt|md|jpg|png)$/i.test(f)).map(f=>path.join(work,f)); if(outFiles.length){const z=path.join(work,'workflow-output.zip'); await zipDir(work,z); await sendFile(sock,jid,z,message,'✅ WORKFLOW complete');} else await sock.sendMessage(jid,{text:`✅ ${result}`},{quoted:message}); return;
    }
    let result;
    if(command==='ilpforms') result=await suite()[spec[0]].action(inputs[0],null,options); else result=await suite()[spec[0]].action(...inputs,options);
    if(spec[2]==='dir'){ if(!fs.existsSync(options.output)) throw new Error('No output directory created.'); const z=path.join(work,`${command}-output.zip`); await zipDir(options.output,z); await sendFile(sock,jid,z,message,'✅ ILP operation complete'); }
    else if(fs.existsSync(options.output)) await sendFile(sock,jid,options.output,message,'✅ ILP operation complete'); else await sock.sendMessage(jid,{text:`✅ ${result}`},{quoted:message});
  } finally { await fs.promises.rm(work,{recursive:true,force:true}).catch(()=>{}); }
}
function menu(prefix='-'){return [
'╭━━━〔 📄 ABIX ILP PDF SUITE 〕━━━╮','┃ Reply to an attachment and run a tool.','╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯','',
'⚡ QUICK',`${prefix}ilp  — image → PDF`,`${prefix}ilpmenu`,'',
'📁 ORGANIZE / OPTIMIZE',`${prefix}ilpmerge`,`${prefix}ilpsplit`,`${prefix}ilporganize`,`${prefix}ilpcompress`,`${prefix}ilprepair`,'',
'🔄 CONVERT',`${prefix}ilppdf2word`,`${prefix}ilpword2pdf`,`${prefix}ilppdf2pptx`,`${prefix}ilppptx2pdf`,`${prefix}ilppdf2excel`,`${prefix}ilpexcel2pdf`,`${prefix}ilppdf2jpg`,`${prefix}ilpjpg2pdf`,`${prefix}ilphtml2pdf`,`${prefix}ilppdfa`,`${prefix}ilppdf2md`,`${prefix}ilpocr`,`${prefix}ilpextracttext`,`${prefix}ilpextractimages`,'',
'✏️ EDIT',`${prefix}ilpedit`,`${prefix}ilpwatermark`,`${prefix}ilprotate`,`${prefix}ilppagenumbers`,`${prefix}ilpcrop`,`${prefix}ilpredact`,`${prefix}ilpsign`,`${prefix}ilpforms`,'',
'🔐 SECURITY',`${prefix}ilpprotect`,`${prefix}ilpunlock`,'',
'🧠 INTELLIGENCE',`${prefix}ilpcompare`,`${prefix}ilpsummarize`,`${prefix}ilptranslate`,`${prefix}ilpworkflow`
].join('\n');}
module.exports={runTool,menu,SPECS,currentOrQuoted};
