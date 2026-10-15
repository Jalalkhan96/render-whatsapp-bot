const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const webp = require('node-webpmux');
const { getFfmpegPath } = require('./ffmpegPath');
const execFileAsync = promisify(execFile);

function resolveFfmpegBinary(){
  return getFfmpegPath();
}

let cachedFfmpeg = undefined;
function getFfmpegBinary(){
  if (cachedFfmpeg === undefined) cachedFfmpeg = resolveFfmpegBinary();
  return cachedFfmpeg;
}

function requireToken(){
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured. Add it to .env.');
  return token;
}
function packNameFromUrl(url){ return decodeURIComponent(String(url).split('/addstickers/')[1]?.split(/[?#]/)[0]||'telegram-pack'); }
function sanitize(v){ return String(v||'ABIX Telegram Pack').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,64)||'ABIX Telegram Pack'; }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function tgJson(token, method, params){
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`, {method:'POST', headers:{'content-type':'application/json','accept':'application/json'}, body:JSON.stringify(params||{})});
  const d=await r.json(); if(!r.ok||!d.ok) throw new Error(d?.description||`${method} failed`); return d.result;
}
async function ffmpegConvert(input, output, animated){
  const binary = getFfmpegBinary();
  if (!binary) {
    throw new Error('No usable ffmpeg found. Install system ffmpeg or set FFMPEG_PATH to an executable binary.');
  }
  const filters='scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0';
  const args=['-y','-i',input,'-vf',filters,'-c:v','libwebp','-lossless','0','-q:v','75','-loop','0','-an',output];
  if(animated) args.splice(args.indexOf('-c:v'),0,'-vsync','0');
  try {
    await execFileAsync(binary,args,{timeout:120000,maxBuffer:8*1024*1024});
  } catch (e) {
    const detail = e?.stderr ? String(e.stderr).trim().split('\n').slice(-3).join(' ') : e.message;
    throw new Error(`ffmpeg conversion failed: ${detail || e.message}`);
  }
}

function isWebpBuffer(buf){
  return Buffer.isBuffer(buf) && buf.length >= 12 && buf.subarray(0,4).toString('ascii') === 'RIFF' && buf.subarray(8,12).toString('ascii') === 'WEBP';
}
async function addExif(buffer, name, emoji){
  const img=new webp.Image(); await img.load(buffer);
  const meta={'sticker-pack-id':crypto.randomBytes(16).toString('hex'),'sticker-pack-name':sanitize(name),'sticker-pack-publisher':String(process.env.BOT_NAME||'ABIX').slice(0,64),'emojis':emoji?[emoji]:['🤖']};
  const attr=Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
  const j=Buffer.from(JSON.stringify(meta)); const exif=Buffer.concat([attr,j]); exif.writeUIntLE(j.length,14,4); img.exif=exif; return img.save(null);
}
async function fetchPack(packUrl, customName){
  const token=requireToken(), rawPack=packNameFromUrl(packUrl), name=sanitize(customName||rawPack);
  const stickers=await tgJson(token,'getStickerSet',{name:rawPack});
  if(!stickers?.stickers?.length) throw new Error('Telegram sticker pack is empty or unavailable.');
  const tmp=path.join(process.cwd(),'temp','telegram-pack',`${Date.now()}_${Math.random().toString(36).slice(2,7)}`); fs.mkdirSync(tmp,{recursive:true});
  const results=[];
  try{
    for(let i=0;i<stickers.stickers.length;i++){
      const s=stickers.stickers[i];
      const fi=await tgJson(token,'getFile',{file_id:s.file_id});
      if(!fi?.file_path) continue;
      const rr=await fetch(`https://api.telegram.org/file/bot${token}/${fi.file_path}`); if(!rr.ok) continue;
      const input=path.join(tmp,`in_${i}${path.extname(fi.file_path||'') || ''}`), output=path.join(tmp,`out_${i}.webp`);
      const rawBuffer = Buffer.from(await rr.arrayBuffer());
      fs.writeFileSync(input,rawBuffer);
      const animated = Boolean(s.is_animated || s.is_video || /\.(tgs|webm)$/i.test(fi.file_path || ''));
      try {
        let stickerBuffer;
        // Normal Telegram stickers are WebP already. Do not invoke ffmpeg for
        // them; this makes static sticker packs work even when ffmpeg-static
        // is missing/corrupt.
        if (!animated && isWebpBuffer(rawBuffer)) {
          stickerBuffer = rawBuffer;
        } else {
          await ffmpegConvert(input,output,animated);
          stickerBuffer = fs.readFileSync(output);
        }
        const wb=await addExif(stickerBuffer,name,s.emoji);
        results.push({buffer:wb,emoji:s.emoji||'🤖',index:i});
      } finally {
        try{fs.unlinkSync(input)}catch{}
        try{fs.unlinkSync(output)}catch{}
      }
    }
  } finally { try{fs.rmSync(tmp,{recursive:true,force:true})}catch{} }
  return {name, sourceCount:stickers.stickers.length, stickers:results};
}
async function sendPack(sock,jid,pack,{quoted=null,delayMs=350}){
  const MAX=60; let packsSent=0;
  if(typeof sock.sendStickerPack==='function'){
    for(let i=0;i<pack.stickers.length;i+=MAX){
      const chunk=pack.stickers.slice(i,i+MAX);
      await sock.sendStickerPack(jid,{stickers:chunk.map(x=>x.buffer),name:chunk.length===pack.stickers.length?pack.name:`${pack.name} ${Math.floor(i/MAX)+1}`,publisher:String(process.env.BOT_NAME||'ABIX')},{quoted});
      packsSent++; await delay(delayMs);
    }
    return {mode:'native-pack',packsSent};
  }
  // Official WhiskeySockets Baileys does not expose a portable sendStickerPack API.
  // Never fake a pack: send every completed conversion only after the full pack is downloaded.
  for(const item of pack.stickers){ await sock.sendMessage(jid,{sticker:item.buffer},{quoted}); await delay(delayMs); }
  return {mode:'individual-fallback',packsSent:0};
}
module.exports={fetchPack,sendPack,packNameFromUrl,sanitize};
