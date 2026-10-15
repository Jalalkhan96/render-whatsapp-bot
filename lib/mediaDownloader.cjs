'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const dns = require('dns').promises;
const net = require('net');

const TMP_ROOT = path.join(os.tmpdir(), 'abix-web-media');
const MAX_BYTES = Math.max(20 * 1024 * 1024, Number(process.env.MEDIA_MAX_BYTES || 250 * 1024 * 1024));
const JOB_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.MEDIA_JOB_TTL_MS || 15 * 60 * 1000));
const MAX_CONCURRENT = Math.max(1, Number(process.env.MEDIA_MAX_CONCURRENT || 1));
const jobs = new Map();
let active = 0;
let ytDlpMode = null;

const ALLOWED_HOSTS = new Set([
  'tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com',
  'youtube.com','www.youtube.com','m.youtube.com','youtu.be','music.youtube.com',
  'instagram.com','www.instagram.com',
  'facebook.com','www.facebook.com','m.facebook.com','fb.watch',
  'x.com','www.x.com','twitter.com','www.twitter.com',
  'pinterest.com','www.pinterest.com','pin.it',
  'reddit.com','www.reddit.com','old.reddit.com','redd.it',
  'snapchat.com','www.snapchat.com',
  'vimeo.com','www.vimeo.com',
  'dailymotion.com','www.dailymotion.com','geo.dailymotion.com',
  'bilibili.com','www.bilibili.com','m.bilibili.com',
  'twitch.tv','www.twitch.tv',
  'streamable.com','www.streamable.com',
  'soundcloud.com','www.soundcloud.com'
]);

function ensureRoot(){ fs.mkdirSync(TMP_ROOT, { recursive: true }); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function safeName(s){ return String(s || 'media').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80) || 'media'; }
function formatDuration(sec){
  const n = Number(sec);
  if(!Number.isFinite(n) || n < 0) return '';
  const h = Math.floor(n/3600), m = Math.floor((n%3600)/60), s = Math.floor(n%60);
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

async function isPrivateHostname(hostname){
  const host = String(hostname || '').toLowerCase();
  if(!host || host === 'localhost' || host.endsWith('.local')) return true;
  if(net.isIP(host)){
    if(host.includes(':')) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
    const p = host.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  try{
    const records = await dns.lookup(host, { all:true });
    return records.some(r => {
      if(net.isIPv4(r.address)){
        const p=r.address.split('.').map(Number);
        return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
      }
      return r.address === '::1' || /^f[cd]/i.test(r.address) || /^fe80:/i.test(r.address);
    });
  }catch{return true;}
}

async function validateUrl(raw){
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('Invalid URL.'); }
  if(u.protocol !== 'https:') throw new Error('Only HTTPS URLs are supported.');
  const host = u.hostname.toLowerCase();
  const extra = String(process.env.MEDIA_ALLOWED_HOSTS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const allowed = ALLOWED_HOSTS.has(host) || extra.some(x => host === x || host.endsWith(`.${x}`));
  if(!allowed) throw new Error('This public site is not enabled in the downloader allowlist.');
  if(await isPrivateHostname(host)) throw new Error('Private/local network destinations are not allowed.');
  return u.toString();
}

function run(cmd, args, options={}){
  return new Promise((resolve,reject)=>{
    const p=spawn(cmd,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,...options});
    let out=''; let err='';
    p.stdout.on('data',d=>{out+=d.toString(); if(out.length>8*1024*1024) out=out.slice(-8*1024*1024);});
    p.stderr.on('data',d=>{err+=d.toString(); if(err.length>2*1024*1024) err=err.slice(-2*1024*1024);});
    p.on('error',reject);
    p.on('close',(code,signal)=>resolve({code,signal,stdout:out,stderr:err}));
  });
}

async function detectYtDlp(){
  if(ytDlpMode) return ytDlpMode;
  const configured = String(process.env.YTDLP_PATH || '').trim();
  if(configured){
    const r=await run(configured,['--version']);
    if(r.code===0){ ytDlpMode={cmd:configured,prefix:[]}; return ytDlpMode; }
  }
  const r=await run('yt-dlp',['--version']);
  if(r.code===0){ ytDlpMode={cmd:'yt-dlp',prefix:[]}; return ytDlpMode; }
  for(const py of ['python3','python']){
    const p=await run(py,['-m','yt_dlp','--version']);
    if(p.code===0){ ytDlpMode={cmd:py,prefix:['-m','yt_dlp']}; return ytDlpMode; }
  }
  throw new Error('yt-dlp is not installed. Install it with: python3 -m pip install -U yt-dlp');
}

function commonArgs(){
  return ['--no-playlist','--no-warnings','--no-progress','--socket-timeout','30','--retries','2','--fragment-retries','2','--max-filesize',`${MAX_BYTES}B`];
}

function qualityFormat(q, ffmpeg){
  const quality = String(q || 'best');
  if(quality === '1080') return ffmpeg ? 'bv*[height<=1080]+ba/b[height<=1080]/b[height<=1080]' : 'best[height<=1080][ext=mp4]/best[height<=1080]/best';
  if(quality === '720') return ffmpeg ? 'bv*[height<=720]+ba/b[height<=720]/b[height<=720]' : 'best[height<=720][ext=mp4]/best[height<=720]/best';
  if(quality === '480') return ffmpeg ? 'bv*[height<=480]+ba/b[height<=480]/b[height<=480]' : 'best[height<=480][ext=mp4]/best[height<=480]/best';
  if(quality === '360') return ffmpeg ? 'bv*[height<=360]+ba/b[height<=360]/b[height<=360]' : 'best[height<=360][ext=mp4]/best[height<=360]/best';
  return ffmpeg ? 'bv*+ba/b' : 'best[ext=mp4]/best';
}

async function hasFfmpeg(){
  const r=await run(process.env.FFMPEG_PATH || 'ffmpeg',['-version']);
  return r.code===0;
}

async function info(rawUrl){
  const url = await validateUrl(rawUrl);
  const yt = await detectYtDlp();
  const r = await run(yt.cmd,[...yt.prefix,...commonArgs(),'--dump-single-json','--skip-download',url]);
  if(r.code!==0) throw new Error(extractUsefulError(r.stderr) || 'Could not resolve this media URL.');
  let data;
  try{ data=JSON.parse(r.stdout.trim().split(/\n/).pop()); }catch{ throw new Error('The media site returned an unsupported response.'); }
  const formats = Array.isArray(data.formats) ? data.formats.filter(f=>f && (f.vcodec && f.vcodec !== 'none')).sort((a,b)=>(Number(b.height)||0)-(Number(a.height)||0)) : [];
  const seen = new Set();
  const simple=[];
  for(const f of formats){
    const h=Number(f.height)||0; const ext=f.ext||''; const key=`${h}-${ext}`;
    if(seen.has(key)) continue; seen.add(key);
    simple.push({label:h ? `${h}p${ext?' • '+ext:''}` : (ext||'video'),height:h,ext});
    if(simple.length>=8) break;
  }
  return {
    title: String(data.title || 'Untitled').slice(0,200),
    uploader: String(data.uploader || data.channel || data.creator || '').slice(0,120),
    duration: Number.isFinite(Number(data.duration)) ? Number(data.duration) : null,
    durationText: formatDuration(data.duration),
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : '',
    webpageUrl: String(data.webpage_url || url),
    extractor: String(data.extractor_key || data.extractor || 'media'),
    platform: prettyPlatform(data.extractor_key || data.extractor || data.webpage_url),
    ext: data.ext || 'mp4',
    formats: simple,
  };
}

function prettyPlatform(value){
  const s=String(value||'').toLowerCase();
  if(s.includes('tiktok')) return 'TikTok'; if(s.includes('youtube')) return 'YouTube'; if(s.includes('instagram')) return 'Instagram'; if(s.includes('facebook')) return 'Facebook'; if(s.includes('twitter')||s.includes('x')) return 'X / Twitter'; if(s.includes('pinterest')) return 'Pinterest'; if(s.includes('reddit')) return 'Reddit'; if(s.includes('snapchat')) return 'Snapchat'; if(s.includes('vimeo')) return 'Vimeo'; if(s.includes('daily')) return 'Dailymotion'; if(s.includes('bilibili')) return 'Bilibili'; if(s.includes('twitch')) return 'Twitch'; return String(value||'Media');
}
function extractUsefulError(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const line=lines.reverse().find(x=>!x.startsWith('WARNING:'));
  return line ? line.replace(/^ERROR:\s*/,'').slice(0,300) : '';
}

async function createJob(rawUrl, quality='best'){
  const url=await validateUrl(rawUrl);
  const infoData=await info(url);
  const id=crypto.randomUUID();
  ensureRoot();
  const dir=path.join(TMP_ROOT,id);
  await fsp.mkdir(dir,{recursive:true});
  const job={id,status:'queued',progress:0,message:'Queued',error:null,filePath:null,filename:null,meta:infoData,createdAt:Date.now(),updatedAt:Date.now()};
  jobs.set(id,job);
  pump({url,quality,dir,job}).catch(err=>{job.status='error';job.error=err.message;job.updatedAt=Date.now();active=Math.max(0,active-1);});
  return {jobId:id,meta:infoData};
}

async function pump(task){
  while(active>=MAX_CONCURRENT){ await new Promise(r=>setTimeout(r,400)); }
  active++;
  const {url,quality,dir,job}=task;
  try{
    job.status='running';job.message='Preparing download';job.progress=10;job.updatedAt=Date.now();
    const yt=await detectYtDlp();
    const ffmpeg=await hasFfmpeg();
    const format=qualityFormat(quality,ffmpeg);
    const output=path.join(dir,`${safeName(job.meta.title || 'media')}-${job.id}.%(ext)s`);
    const args=[...yt.prefix,...commonArgs(),'--newline','--restrict-filenames','--format',format,'--output',output];
    if(ffmpeg) args.push('--merge-output-format','mp4');
    args.push(url);
    const r=await run(yt.cmd,args);
    if(r.code!==0) throw new Error(extractUsefulError(r.stderr) || 'yt-dlp failed to download the media.');
    const files=(await fsp.readdir(dir)).filter(f=>!f.endsWith('.part') && !f.endsWith('.ytdl'));
    if(!files.length) throw new Error('Download completed without producing a media file.');
    const full=path.join(dir,files[0]);
    const stat=await fsp.stat(full);
    if(stat.size<=0) throw new Error('Downloaded file is empty.');
    if(stat.size>MAX_BYTES) throw new Error(`Downloaded file exceeds ${Math.round(MAX_BYTES/1024/1024)} MB limit.`);
    job.filePath=full;job.filename=files[0];job.status='ready';job.progress=100;job.message='Download ready';job.updatedAt=Date.now();
  }catch(err){
    job.status='error';job.error=String(err.message||err);job.message='Download failed';job.updatedAt=Date.now();
    await fsp.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }finally{active=Math.max(0,active-1);}
}

function getJob(id){
  const job=jobs.get(String(id));
  if(!job) return null;
  return {
    jobId:job.id,status:job.status,progress:job.progress,message:job.message,error:job.error,
    downloadUrl:job.status==='ready'?`/api/media/file/${encodeURIComponent(job.id)}`:null,
    meta:job.meta
  };
}

async function streamJobFile(id,res){
  const job=jobs.get(String(id));
  if(!job || job.status!=='ready' || !job.filePath) return false;
  try{
    await fsp.access(job.filePath,fs.constants.R_OK);
    res.download(job.filePath,job.filename,err=>{
      setTimeout(async()=>{const dir=path.dirname(job.filePath);jobs.delete(job.id);await fsp.rm(dir,{recursive:true,force:true}).catch(()=>{});},500);
      if(err && !res.headersSent) res.status(500).json({error:'Failed to send downloaded file.'});
    });
    return true;
  }catch{return false;}
}

function cleanupExpired(){
  const cutoff=Date.now()-JOB_TTL_MS;
  for(const [id,job] of jobs){
    if(job.updatedAt<cutoff){
      jobs.delete(id);
      if(job.filePath) fsp.rm(path.dirname(job.filePath),{recursive:true,force:true}).catch(()=>{});
    }
  }
}
ensureRoot();
setInterval(cleanupExpired,60*1000).unref();

module.exports={validateUrl,info,createJob,getJob,streamJobFile,MAX_BYTES,ALLOWED_HOSTS};
