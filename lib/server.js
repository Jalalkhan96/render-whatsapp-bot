'use strict';

const express = require('express');
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');
const packageInfo = require('../package.json');
const gemini = require('./geminiService');
const mediaDownloader = require('./mediaDownloader.cjs');

const app = express();
const server = createServer(app);
const WEB_DIR = path.join(__dirname, '..', 'web');
const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
let commandProvider = null;

function configureDashboard(provider){ commandProvider = provider && typeof provider.getCommandInventory === 'function' ? provider : null; }
function safePublicUrl(req){
  const configured=String(process.env.PUBLIC_URL||process.env.KATABUMP_PUBLIC_URL||'').trim().replace(/\/$/,'');
  if(configured) return configured;
  const domain=String(process.env.KATABUMP_DOMAIN||process.env.KATABUMP_DNS||'').trim().replace(/^https?:\/\//i,'').replace(/\/$/,'');
  if(domain) return `https://${domain}`;
  const forwardedHost=String(req.headers['x-forwarded-host']||'').split(',')[0].trim();
  const host=forwardedHost||req.get('host')||`127.0.0.1:${PORT}`;
  const forwardedProto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim();
  const proto=forwardedProto||req.protocol||'http';
  return `${proto}://${host}`;
}
function getDiskStats(){ try{const stat=fs.statfsSync(process.cwd());const total=Number(stat.blocks)*Number(stat.bsize);const available=Number(stat.bavail)*Number(stat.bsize);const used=Math.max(0,total-available);const percent=total>0?Number(((used/total)*100).toFixed(1)):null;return{total,available,used,percent};}catch{return{total:null,available:null,used:null,percent:null};} }
function getWhatsAppStatus(){const s=global.__ABIX_WEB_STATE||{};return{status:s.status||'starting',connectedAt:s.connectedAt||null,lastChangeAt:s.lastChangeAt||null};}
function getTelegramStatus(){const configured=Boolean(String(process.env.TELEGRAM_BOT_TOKEN||'').trim());const s=global.__ABIX_TELEGRAM_STATE||{};return{configured,status:configured&&s.status==='disabled'?'starting':(s.status||(configured?'starting':'disabled')),username:s.username||null,connectedAt:s.connectedAt||null,lastChangeAt:s.lastChangeAt||null};}
function getStorageInfo(){try{const store=require('./lightweight_store');const stats=typeof store.getStats==='function'?store.getStats():{};return{backend:stats.backend||'local',messages:Number(stats.messages||0),contacts:Number(stats.contacts||0)};}catch{return{backend:'unknown',messages:0,contacts:0};}}
function getCommandSummary(){const inventory=commandProvider?commandProvider.getCommandInventory():[];const publicCommands=inventory.filter(e=>String(e.permission||'').toUpperCase()==='PUBLIC');const categoryCounts={};for(const e of publicCommands){const c=String(e.category||'misc').toLowerCase();categoryCounts[c]=(categoryCounts[c]||0)+1;}return{total:inventory.length,public:publicCommands.length,restricted:Math.max(0,inventory.length-publicCommands.length),categoryCounts,publicCommands};}
function jsonNoCache(req,res,next){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');next();}

app.disable('x-powered-by');
app.use(jsonNoCache);
app.use(express.json({limit:'64kb'}));
app.use('/web',express.static(WEB_DIR,{fallthrough:false,maxAge:'5m'}));

app.get('/api/status',(req,res)=>{
  const disk=getDiskStats(), memory=process.memoryUsage(), commands=getCommandSummary(), wa=getWhatsAppStatus(), telegram=getTelegramStatus(), storage=getStorageInfo(), publicUrl=safePublicUrl(req);
  let geminiStatus={};try{geminiStatus=gemini.status()||{};}catch{}
  const healthy=wa.status==='connected'||telegram.status==='connected';
  res.json({health:healthy?'ok':'degraded',bot:{name:process.env.BOT_NAME||packageInfo.name||'ABIX-AE',version:packageInfo.version||'unknown'},version:packageInfo.version||null,uptime:Math.floor(process.uptime()),host:HOST,port:PORT,memory:{rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,external:memory.external},memoryWarnMb:Number(process.env.BOT_MEMORY_WARN_MB||512),disk,whatsapp:wa,telegram,gemini:{configured:geminiStatus.configured!==false,model:geminiStatus.model||null,running:geminiStatus.running??geminiStatus.ready??null},storage,commands:{total:commands.total,public:commands.public,restricted:commands.restricted,categoryCounts:commands.categoryCounts},publicUrl,directUrl:`${req.protocol||'http'}://${req.get('host')||`127.0.0.1:${PORT}`}`,katabump:{domain:String(process.env.KATABUMP_DOMAIN||process.env.KATABUMP_DNS||'').trim()||null,publicUrl,configured:Boolean(process.env.KATABUMP_DOMAIN||process.env.KATABUMP_DNS||process.env.KATABUMP_PUBLIC_URL||process.env.PUBLIC_URL)},timestamp:new Date().toISOString()});
});

app.get('/api/commands',(req,res)=>{const s=getCommandSummary();res.json({count:s.public,commands:s.publicCommands.map(e=>({command:e.command,aliases:Array.isArray(e.aliases)?e.aliases:[],category:e.category||'misc',status:e.status||'ON'}))});});
app.get('/api/games',(req,res)=>{try{const arcade=require('../plugins2/wa-tricks/arcade-games.cjs');res.json({count:Array.isArray(arcade.ARCADE_CATALOG)?arcade.ARCADE_CATALOG.length:0,games:Array.isArray(arcade.ARCADE_CATALOG)?arcade.ARCADE_CATALOG:[]});}catch{res.json({count:0,games:[]});}});

app.post('/api/media/info',async(req,res)=>{try{const data=await mediaDownloader.info(req.body?.url);res.json(data);}catch(err){res.status(400).json({error:String(err.message||err)});}});
app.post('/api/media/download',async(req,res)=>{try{const quality=['best','1080','720','480','360'].includes(String(req.body?.quality))?String(req.body.quality):'best';const result=await mediaDownloader.createJob(req.body?.url,quality);res.status(202).json(result);}catch(err){res.status(400).json({error:String(err.message||err)});}});
app.get('/api/media/jobs/:id',(req,res)=>{const job=mediaDownloader.getJob(req.params.id);if(!job)return res.status(404).json({error:'Download job not found or expired.'});res.json(job);});
app.get('/api/media/file/:id',async(req,res)=>{const ok=await mediaDownloader.streamJobFile(req.params.id,res);if(!ok && !res.headersSent)res.status(404).json({error:'Downloaded file not found or expired.'});});
app.get('/api/media/platforms',(req,res)=>res.json({platforms:Array.from(mediaDownloader.ALLOWED_HOSTS)}));

app.get('/healthz',(req,res)=>{
  // Render liveness check: HTTP process is live even while WhatsApp is pairing/reconnecting.
  res.status(200).json({status:'ok',uptime:Math.floor(process.uptime()),timestamp:new Date().toISOString()});
});

app.get('/health',(req,res)=>{const wa=getWhatsAppStatus();const telegram=getTelegramStatus();let g={};try{g=gemini.status()||{};}catch{}const healthy=wa.status==='connected'||telegram.status==='connected';res.status(healthy?200:503).json({status:healthy?'ok':'degraded',whatsapp:wa.status,telegram:telegram.status,telegramConfigured:telegram.configured,gemini:g.configured!==false?'configured':'not-configured',uptime:Math.floor(process.uptime())});});
app.get('/process',(req,res)=>{const{send}=req.query;if(!send)return res.status(400).json({error:'Missing send query'});res.json({status:'Received',data:send});});
app.get('/chat',(req,res)=>{const{message,to}=req.query;if(!message||!to)return res.status(400).json({error:'Missing message or to query'});res.json({status:200,info:'Message received (integration not implemented)'});});
app.get('/games',(req,res)=>{try{const arcade=require('../plugins2/wa-tricks/arcade-games.cjs');res.type('html').send(arcade.buildGameMenuHtml('-'));}catch(error){res.status(500).type('text').send(`Game menu unavailable: ${error.message}`);}});
app.get('/games/:game',(req,res)=>{try{const arcade=require('../plugins2/wa-tricks/arcade-games.cjs');const game=arcade.resolveGame(req.params.game);if(!game)return res.status(404).type('text').send('Game not found');const html=arcade.personalizedHtml(game,'')||arcade.gameTemplate(game,'');res.type('html').send(html);}catch(error){res.status(500).type('text').send(`Game unavailable: ${error.message}`);}});
app.get('/',(req,res)=>{const indexPath=path.join(WEB_DIR,'index.html');if(!fs.existsSync(indexPath))return res.status(503).type('text').send('ABIX web UI is not installed.');res.sendFile(indexPath);});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
module.exports={app,server,PORT,HOST,configureDashboard};
