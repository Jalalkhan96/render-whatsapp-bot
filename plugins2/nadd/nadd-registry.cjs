'use strict';
/**
 * NADD (New Additions) command bridge.
 * All commands are namespaced with `nadd` to guarantee no command/alias
 * conflicts with the existing ABIX command registry.
 * Raw third-party/suite source lives under ./engines and is excluded from the
 * command loader by lib/commandHandler.js; only this bridge is registered.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const ENGINES = path.join(ROOT, 'engines');
const TEMP_ROOT = path.join(os.tmpdir(), 'abix-nadd');
fs.mkdirSync(TEMP_ROOT, { recursive: true });

function chatIdOf(message, context) { return context?.chatId || message?.key?.remoteJid; }
function senderOf(message, context) { return context?.senderId || message?.key?.participant || message?.key?.remoteJid; }
async function send(sock, jid, text) {
  const value = String(text ?? '').slice(0, 65000);
  return sock.sendMessage(jid, { text: value });
}
function splitNadd(name) { return String(name || '').replace(/^nadd/, ''); }
function prefixedAliases(names) { return names.map((n) => `nadd${n.replace(/[^a-z0-9_-]/gi, '')}`); }

function plugin(command, aliases, category, description, usage, handler, extra = {}) {
  return { command, aliases, category, description, usage, ...extra, handler };
}

function runProcess(bin, args, options = {}) {
  const timeoutMs = options.timeoutMs || 90000;
  const cwd = options.cwd || undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = (err, result) => { if (done) return; done = true; clearTimeout(timer); err ? reject(err) : resolve(result); };
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(new Error(`process timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); if (stdout.length > 48000) stdout = stdout.slice(-48000); });
    child.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 24000) stderr = stderr.slice(-24000); });
    child.on('error', (e) => finish(e));
    child.on('close', (code, signal) => finish(null, { code, signal, stdout, stderr }));
  });
}

async function runNodeScript(script, args, options = {}) {
  return runProcess(process.execPath, [script, ...args], { ...options, cwd: options.cwd || path.dirname(script) });
}
async function runPythonScript(script, args, options = {}) {
  const bins = process.env.PYTHON_BIN ? [process.env.PYTHON_BIN] : ['python3', 'python'];
  let last = null;
  for (const bin of bins) {
    try { return await runProcess(bin, [script, ...args], { ...options, cwd: options.cwd || path.dirname(script) }); }
    catch (e) { last = e; if (!/ENOENT|spawn/i.test(String(e.message))) break; }
  }
  throw last || new Error('Python runtime unavailable');
}
function outputOf(r) {
  const body = [r.stdout?.trim(), r.stderr?.trim() ? `stderr: ${r.stderr.trim()}` : ''].filter(Boolean).join('\n\n');
  return body || `Process exited with code ${r.code ?? 'unknown'}.`;
}
async function runAndReply(sock, jid, runner) {
  try {
    const r = await runner();
    const out = outputOf(r);
    await send(sock, jid, out);
  } catch (e) { await send(sock, jid, `❌ NADD error: ${String(e.message || e).slice(0, 500)}`); }
}

/* ---------------- NADD MENU ---------------- */
const groups = [
  {
    title: '🔗 LINK INTELLIGENCE',
    items: [
      ['naddlinkshort [provider] <url>', 'Shorten URL'], ['naddlinkautoshort <url>', 'Auto shortener'], ['naddlinkexpand <url>', 'Expand + intel'],
      ['naddlinkunshort <url>', 'Expand alias'], ['naddlinkredirecttrace <url>', 'Trace redirect chain'], ['naddlinkcheck <url>', 'Link status/risk'],
      ['naddlinkpreview <url>', 'Page preview metadata'], ['naddlinkcleanlink <url>', 'Remove tracking params'], ['naddlinkinfo <url>', 'Link classification'],
      ['naddlinkcomparelink <u1> <u2>', 'Compare destinations'], ['naddlinkexpandbulk <urls>', 'Bulk expansion (max 20)'],
      ['naddlinkstatus', 'Provider status'], ['naddlinkhealth', 'Health status'], ['naddlinkhistory', 'Recent history'], ['naddlinksearch <q>', 'Provider search'], ['naddlinkqr <url>', 'Generate QR'],
    ],
  },
  {
    title: '🖼️ IMAGE INTELLIGENCE',
    items: [
      ['naddimage <q>', '100-source image search'], ['naddimg <q>', 'Image alias'], ['naddphoto <q>', 'Photo alias'],
      ['naddphotos <q>', 'Photo search alias'], ['naddpicture <q>', 'Picture alias'], ['naddpic <q>', 'Picture alias'],
      ['naddfreeimage <q>', 'Free image search'], ['naddwallpaper <q>', 'Wallpaper search'], ['naddillustration <q>', 'Illustration search'],
      ['naddvector <q>', 'Vector search'], ['naddicon <q>', 'Icon search'], ['naddpublicdomain <q>', 'Public-domain images'], ['naddpd <q>', 'Public-domain alias'],
      ['naddccimage <q>', 'CC image search'], ['naddcc0 <q>', 'CC0 alias'], ['naddopenimage <q>', 'Open image search'], ['naddimageall <q>', 'All relevant sources'],
      ['naddbestimage <q>', 'Top ranked image'], ['naddcommercialimage <q>', 'Commercial-use images'], ['naddimgurl <q>', 'Image URLs only'],
      ['naddimagecompare <q>', 'Compare sources'], ['naddimagedetail <n|source:id>', 'Image metadata/license'], ['naddimgdl <source id|url>', 'License-checked download'],
      ['nadddownloadimage <source id|url>', 'Download alias'], ['naddimagestatus', '100-source health'], ['naddimagesource <action> <id>', 'Source admin'],
      ['naddnext', 'Next image page'], ['naddprev', 'Previous image page'], ['naddimagehelp', 'Image help'],
    ],
  },
  {
    title: '🎵 MUSIC INTELLIGENCE',
    items: [
      ['naddmusicmenu', 'Music menu'], ['naddsong <title> [artist]', 'Song metadata'], ['naddlyrics <song>', 'Licensed lyrics source'],
      ['naddfindsong <lyrics>', 'Find song by lyrics fragment'], ['naddartist <name>', 'Artist information'], ['naddalbum <name>', 'Album information'],
      ['naddsongmeaning <song>', 'Song meaning'], ['naddsongfacts <song>', 'Song facts'], ['naddsampled <song>', 'Samples/interpolations'],
      ['naddtranslatesong <song> | <language>', 'Authorized translation source'], ['naddtrendingmusic [country]', 'Trending music'],
      ['naddchart [country]', 'Charts'], ['naddnewmusic', 'New releases'], ['naddidentify', 'Audio identification'], ['naddidentifyvoice', 'Voice-note identification'],
      ['naddpklyrics <song>', 'Pakistan/Urdu lyrics source'], ['naddurdulyrics <song>', 'Urdu lyrics source'], ['naddpunjabilyrics <song>', 'Punjabi lyrics source'], ['naddhindilyrics <song>', 'Hindi lyrics source'],
    ],
  },
  {
    title: '📚 OPEN KNOWLEDGE',
    items: [
      ['naddknowwiki <q>', 'Wikipedia knowledge'], ['naddknowwikidata <q>', 'Wikidata entities'], ['naddknowarchive <q>', 'Internet Archive'], ['naddknowarchiveall <q>', 'Archive-wide search'],
      ['naddknowbook <q>', 'Books'], ['naddknowauthor <q>', 'Authors'], ['naddknowdocument <q>', 'Documents'], ['naddknowhistory <q>', 'Historical material'],
      ['naddknownewspaper <q>', 'Newspapers'], ['naddknowpaper <q>', 'Research papers'], ['naddknowresearch <q>', 'Research sources'], ['naddknowdataset <q>', 'Datasets'],
      ['naddknowgovdata <q>', 'Government data'], ['naddknowscience <q>', 'Science sources'], ['naddknowplace <q>', 'Places'], ['naddknowmapinfo <q>', 'Map/place info'],
      ['naddknowoldphoto <q>', 'Historic photos'], ['naddknowmuseum <q>', 'Museum collections'], ['naddknowart <q>', 'Art collections'], ['naddknowpublicdomain <q>', 'Public-domain knowledge'],
      ['naddknowwebarchive <q>', 'Web archives'], ['naddknowai <q>', 'AI/ML knowledge'], ['naddknowknowledge <q>', 'Broad knowledge search'], ['naddknowsearchtext <q>', 'Text search'],
      ['naddknowbooksearch <q>', 'Book search'], ['naddknownext <session>', 'Next page'], ['naddknowprev <session>', 'Previous page'], ['naddknowsourcehealth', 'Source health'],
      ['naddknowtestsource <id>', 'Test source'], ['naddknowtestall', 'Test enabled sources'], ['naddknowingest <source>', 'Register ingest job'], ['naddknowingeststatus <source>', 'Ingest status'],
      ['naddknowingestpause <source>', 'Pause ingest'], ['naddknowingestresume <source>', 'Resume ingest'], ['naddknowingeststop <source>', 'Stop ingest'], ['naddknowsource <action> <id>', 'Source admin'],
    ],
  },
  {
    title: '📺 TELEGRAM PUBLIC CHANNEL FINDER',
    items: [
      ['naddtgfind <query>', 'Search local Telegram index'], ['naddtgfindlive <query>', 'Search watchlist live'], ['naddtgfindin <channel> <q>', 'Search one public channel'],
      ['naddtgdeepfind <query>', 'Discover + index + search'], ['naddtgindex <channel> [pages]', 'Index public channel'], ['naddtgindexlist', 'Indexed channels'],
      ['naddtgadd <channel>', 'Add watchlist channel'], ['naddtgdel <channel>', 'Remove watchlist channel'], ['naddtglist', 'Watchlist'],
      ['naddtgcsearch <keyword>', 'Discover public channels'], ['naddtginfo <channel>', 'Channel metadata'], ['naddtghelp', 'TG help'],
    ],
  },
  {
    title: '🌐 SCRAPE100 + 20-SITE',
    items: [
      ['naddscrape <site>', 'Scrape one scrape100 site'], ['naddscrapeall', 'Run all enabled sites sequentially'], ['naddscrapestatus', 'Recent scrape statuses'],
      ['naddscrapefailed', 'Latest failed sites'], ['naddscrapecategory <cat>', 'Run a category'], ['naddscrapecountry <PK|INT>', 'Run a country group'],
      ['naddscrapesearch <site> <q>', 'Search within a site'], ['naddscrapehealth [site]', 'Source health'], ['naddscrapeschedule', 'Start scheduler'],
      ['nadd20sites [only=a,b] [max=N]', 'Scrape 20 public sites sequentially'], ['nadd20site <site> [max=N]', 'Scrape one of 20 sites'], ['nadd20list', 'List 20-site IDs'],
    ],
  },
  {
    title: '📖 WEBTOON + OPEN MEDIA',
    items: [
      ['naddwebtoonadd <series-url>', 'Track a WEBTOON series'], ['naddwebtooncheck', 'Check tracked series'], ['naddwebtoonlist', 'Tracked series'], ['naddwebtoonremove <id>', 'Remove tracker'],
      ['naddxkcd <args>', 'Open-license xkcd tool'], ['naddiacomicsearch <q>', 'Open-license IA comics search'], ['naddiacomicdownload <id>', 'Download verified-license IA comic'],
      ['naddiavideosearch <q>', 'Open-license IA video search'], ['naddiavideodownload <id>', 'Download verified-license IA video'],
      ['naddcommonsvideosearch <q>', 'Wikimedia Commons video search'], ['naddcommonsvideodownload <file>', 'Download verified-license Commons video'],
    ],
  },

];

const menuText = [
  '🎛️ NADD MENU — NEW ADDITIONS',
  '',
  'All NADD commands use the `nadd` namespace so they do not conflict with existing ABIX commands.',
  '',
  ...groups.flatMap((g) => [g.title, ...g.items.map(([c, d]) => `• -${c} — ${d}`), '']),
  'Use: -naddmenu',
].join('\n').replace(/`/g, '');

const registry = [];
registry.push(plugin('naddmenu', ['naddhelp'], 'nadd', 'All newly integrated commands', '-naddmenu', async (sock, message) => {
  await send(sock, chatIdOf(message), menuText);
}, { dedicatedMenu: false }));

/* ---------------- Link engine ---------------- */
const link = require(path.join(ENGINES, 'link-intelligence-engine', 'plugins', 'link-commands.cjs'));
for (const [src, fn] of Object.entries(link.commands || {})) {
  const raw = src.replace(/[^a-z0-9_-]/gi, '');
  const suffix = raw.startsWith('link') ? raw.slice(4) : raw;
  const name = `naddlink${suffix}`;
  registry.push(plugin(name, [], 'nadd-link', link.help ? `Link Intelligence: ${src}` : 'Link Intelligence', `-${name}`, async (sock, message, args, context) => {
    const jid = chatIdOf(message, context);
    const ctx = { reply: (t) => send(sock, jid, t), line: { sock }, chatJid: jid, msg: message, cmd: src, prefix: context?.prefix || '-', isOwner: context?.isOwner, isAdmin: context?.isAdmin };
    await fn(ctx, args);
  }));
}

/* ---------------- Image engine ---------------- */
const image = require(path.join(ENGINES, 'image-intelligence-engine', 'plugins', 'image.cjs'));
for (const [src, fn] of Object.entries(image.commands || {})) {
  const name = `nadd${src.replace(/[^a-z0-9_-]/gi, '')}`;
  registry.push(plugin(name, [], 'nadd-image', `Image Intelligence: ${src}`, `-${name} <query>`, async (sock, message, args, context) => {
    const jid = chatIdOf(message, context);
    const ctx = {
      reply: (t) => send(sock, jid, t), line: { sock }, chatJid: jid, msg: message,
      senderJid: senderOf(message, context), isOwner: Boolean(context?.isOwner), prefix: context?.prefix || '-',
      dataDir: path.join(TEMP_ROOT, 'image-data'), config: context?.config || {},
    };
    fs.mkdirSync(ctx.dataDir, { recursive: true });
    await fn(ctx, args, args.join(' '));
  }));
}

/* ---------------- Music engine ---------------- */
const music = require(path.join(ENGINES, 'music-engine', 'music', 'bot-commands.cjs'));
for (const c of (music.commands || [])) {
  const name = `nadd${c.name.replace(/[^a-z0-9]/gi, '')}`;
  const aliases = (c.aliases || []).map((a) => `nadd${a.replace(/[^a-z0-9]/gi, '')}`).filter((a) => a !== name);
  registry.push(plugin(name, aliases, 'nadd-music', c.description, c.usage ? c.usage.replace(/^-?[a-z0-9_-]+/i, `-${name}`) : `-${name}`, async (sock, message, args, context) => {
    const jid = chatIdOf(message, context);
    const reply = (t) => send(sock, jid, t);
    const text = `-${c.name}${args.length ? ' ' + args.join(' ') : ''}`;
    const handled = await music.handleMusicMessage(text, {
      reply, sock, msg: message, sender: senderOf(message, context),
      audioBuffer: context?.audioBuffer || null, audioMime: context?.audioMime || null,
    });
    if (!handled) await reply(`❌ Music command unavailable: -${name}`);
  }));
}

/* ---------------- Open knowledge engine ---------------- */
const knowledge = require(path.join(ENGINES, 'open-knowledge-engine', 'commands.cjs'));
for (const src of knowledge.commands || []) {
  const name = `naddknow${src.replace(/[^a-z0-9_-]/gi, '')}`;
  registry.push(plugin(name, [], 'nadd-knowledge', `Open Knowledge: ${src}`, `-${name} <query>`, async (sock, message, args, context) => {
    const jid = chatIdOf(message, context);
    const out = await knowledge.handle(src, args.join(' '), {
      ...context, isOwner: Boolean(context?.isOwner), isAdmin: Boolean(context?.isAdmin),
    });
    if (out != null) await send(sock, jid, out);
  }));
}

/* ---------------- Telegram finder ---------------- */
const tgRoot = path.join(ENGINES, 'tg-channel-finder');
const { channelInfo, searchChannel, fetchChannelPosts, discoverChannels } = require(path.join(tgRoot, 'lib', 'scrape.cjs'));
const tgIndex = require(path.join(tgRoot, 'lib', 'index.cjs'));
const tgDataDir = path.join(TEMP_ROOT, 'tg-finder');
const tgStateFile = path.join(tgDataDir, 'state.json');
fs.mkdirSync(tgDataDir, { recursive: true });
function tgLoad() { try { const v = JSON.parse(fs.readFileSync(tgStateFile, 'utf8')); return v && typeof v === 'object' ? v : { watch: [], idx: { version: 1, channels: {} } }; } catch { return { watch: [], idx: { version: 1, channels: {} } }; } }
function tgSave(s) { fs.writeFileSync(tgStateFile, JSON.stringify(s)); }
const tgCmds = {
  naddtgfind: async (sock, message, args, context) => {
    const s = tgLoad(), q = args.join(' '); const found = tgIndex.searchIndex(s.idx, q, 20); await send(sock, chatIdOf(message, context), found.length ? found.map((x,i)=>`${i+1}. @${x.channel} #${x.msgId}\n${x.text}\n${x.link}`).join('\n\n') : 'No indexed results. Use -naddtgindex <channel> or -naddtgdeepfind <query>.');
  },
  naddtgfindlive: async (sock, message, args, context) => {
    const q=args.join(' '); const s=tgLoad(); let all=[]; for(const ch of s.watch.slice(0,20)){ try{ const hits=await searchChannel(ch,q,2); all.push(...hits);}catch{} } all=all.slice(0,20); await send(sock, chatIdOf(message,context), all.length?all.map((x,i)=>`${i+1}. @${x.channel} ${x.link}\n${x.text}`).join('\n\n'):'No live matches found.');
  },
  naddtgfindin: async (sock, message, args, context) => { const ch=args[0], q=args.slice(1).join(' '); if(!ch||!q)return send(sock,chatIdOf(message,context),'Usage: -naddtgfindin <channel> <query>'); const hits=await searchChannel(ch.replace(/^@/,''),q,3); await send(sock,chatIdOf(message,context),hits.length?hits.map((x)=>`${x.link}\n${x.text}`).join('\n\n'):'No matches.'); },
  naddtgdeepfind: async (sock, message, args, context) => { const q=args.join(' '); if(!q)return send(sock,chatIdOf(message,context),'Usage: -naddtgdeepfind <query>'); const found=await discoverChannels(q,5); const s=tgLoad(); for(const f of found){ const ch=f.channel.toLowerCase(); if(!s.watch.includes(ch)) s.watch.push(ch); try{await tgIndex.indexChannel(s.idx,ch,3);}catch{} } tgSave(s); const hits=tgIndex.searchIndex(s.idx,q,15); await send(sock,chatIdOf(message,context),`Discovered: ${found.map(f=>'@'+f.channel).join(', ')||'none'}\n\n${hits.length?hits.map((x)=>`${x.link}\n${x.text}`).join('\n\n'):'No indexed text matched yet.'}`); },
  naddtgindex: async (sock,message,args,context)=>{ const ch=(args[0]||'').replace(/^@/,''); const pages=Math.min(20,Math.max(1,Number(args[1])||5)); if(!ch)return send(sock,chatIdOf(message,context),'Usage: -naddtgindex <channel> [pages]'); const s=tgLoad(); const r=await tgIndex.indexChannel(s.idx,ch,pages); if(!s.watch.includes(ch))s.watch.push(ch); tgSave(s); await send(sock,chatIdOf(message,context),`✅ Indexed @${ch}: +${r.added}, total ${r.total}`); },
  naddtgindexlist: async(sock,message,args,context)=>{const s=tgLoad(); await send(sock,chatIdOf(message,context),tgIndex.indexStats(s.idx).map(x=>`@${x.channel} — ${x.posts} posts`).join('\n')||'No indexed channels.');},
  naddtgadd: async(sock,message,args,context)=>{const ch=(args[0]||'').replace(/^@/,'');if(!ch)return send(sock,chatIdOf(message,context),'Usage: -naddtgadd <channel>');const info=await channelInfo(ch);const s=tgLoad();if(!s.watch.includes(ch))s.watch.push(ch);tgSave(s);await send(sock,chatIdOf(message,context),`✅ Added @${ch}${info.title?' — '+info.title:''}`);},
  naddtgdel: async(sock,message,args,context)=>{const ch=(args[0]||'').replace(/^@/,'');const s=tgLoad();s.watch=s.watch.filter(x=>x!==ch);tgSave(s);await send(sock,chatIdOf(message,context),`Removed @${ch}.`);},
  naddtglist: async(sock,message,args,context)=>{const s=tgLoad();await send(sock,chatIdOf(message,context),s.watch.length?s.watch.map(x=>'• @'+x).join('\n'):'Watchlist empty.');},
  naddtgcsearch: async(sock,message,args,context)=>{const q=args.join(' ');const found=await discoverChannels(q,10);await send(sock,chatIdOf(message,context),found.length?found.map((x)=>`@${x.channel} — ${x.title}\n${x.link}`).join('\n\n'):'No public channels found.');},
  naddtginfo: async(sock,message,args,context)=>{const ch=(args[0]||'').replace(/^@/,''); if(!ch)return send(sock,chatIdOf(message,context),'Usage: -naddtginfo <channel>'); const i=await channelInfo(ch); await send(sock,chatIdOf(message,context),`@${ch}\n${i.title}\n${i.members||''}\n${i.description||''}`);},
  naddtghelp: async(sock,message,args,context)=>send(sock,chatIdOf(message,context),groups.find(g=>g.title.includes('TELEGRAM')).items.map(([c,d])=>`-${c} — ${d}`).join('\n')),
};
for (const [name, fn] of Object.entries(tgCmds)) {
  registry.push(plugin(name, [], 'nadd-telegram', `Telegram finder: ${name.slice(4)}`, `-${name}`, fn, { ownerOnly: true }));
}

/* ---------------- Webtoon + open media CLIs ---------------- */
const web = path.join(ENGINES, 'webtoon-and-open-media-kit');
const webtoonCli = path.join(web, 'webtoon-tracker.cjs');
const comicsCli = path.join(web, 'open-comics.cjs');
const ccVideoCli = path.join(web, 'cc-video.cjs');
registry.push(plugin('naddwebtoonadd', [], 'nadd-open-media', 'Track a WEBTOON series', '-naddwebtoonadd <url>', async (s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(webtoonCli,['add',a.join(' ')]))));
registry.push(plugin('naddwebtooncheck', [], 'nadd-open-media', 'Check tracked WEBTOON series', '-naddwebtooncheck', async (s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(webtoonCli,['check','--json']))));
registry.push(plugin('naddwebtoonlist', [], 'nadd-open-media', 'List tracked WEBTOON series', '-naddwebtoonlist', async (s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(webtoonCli,['list']))));
registry.push(plugin('naddwebtoonremove', [], 'nadd-open-media', 'Remove tracked WEBTOON series', '-naddwebtoonremove <title|id>', async (s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(webtoonCli,['remove',a.join(' ')]))));

async function cliWithTemp(script,args,sendFiles,sock,jid) {
  const outDir=fs.mkdtempSync(path.join(TEMP_ROOT,'media-'));
  try {
    const r=await runNodeScript(script,[...args,'--out',outDir],{timeoutMs:180000});
    const files=fs.readdirSync(outDir).map(f=>path.join(outDir,f)).filter(f=>fs.statSync(f).isFile());
    if(!files.length)return send(sock,jid,outputOf(r));
    for(const f of files){ const ext=path.extname(f).toLowerCase(); const data=fs.readFileSync(f); if(/\.(jpg|jpeg|png|webp)$/i.test(ext)) await sock.sendMessage(jid,{image:data,caption:path.basename(f)}); else if(/\.(mp4|webm|mov|m4v)$/i.test(ext)) await sock.sendMessage(jid,{video:data,caption:path.basename(f)}); else await sock.sendMessage(jid,{document:data,fileName:path.basename(f)}); }
  } finally { try{fs.rmSync(outDir,{recursive:true,force:true});}catch{} }
}
registry.push(plugin('naddxkcd', [], 'nadd-open-media', 'Open-license xkcd tool', '-naddxkcd <xkcd args>', async(s,m,a,c)=>cliWithTemp(comicsCli,['xkcd',...a],[],s,chatIdOf(m,c)), { ownerOnly:true }));
registry.push(plugin('naddiacomicsearch', [], 'nadd-open-media', 'Open-license Internet Archive comic search', '-naddiacomicsearch <query>', async(s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(comicsCli,['ia-search',...a]))));
registry.push(plugin('naddiacomicdownload', [], 'nadd-open-media', 'Download verified-license IA comic', '-naddiacomicdownload <id>', async(s,m,a,c)=>cliWithTemp(comicsCli,['ia-download',a[0]],[],s,chatIdOf(m,c)), { ownerOnly:true }));
registry.push(plugin('naddiavideosearch', [], 'nadd-open-media', 'Open-license IA video search', '-naddiavideosearch <query>', async(s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(ccVideoCli,['ia-search',...a]))));
registry.push(plugin('naddiavideodownload', [], 'nadd-open-media', 'Download verified-license IA video', '-naddiavideodownload <id>', async(s,m,a,c)=>cliWithTemp(ccVideoCli,['ia-download',a[0]],[],s,chatIdOf(m,c)), { ownerOnly:true }));
registry.push(plugin('naddcommonsvideosearch', [], 'nadd-open-media', 'Wikimedia Commons video search', '-naddcommonsvideosearch <query>', async(s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(ccVideoCli,['commons-search',...a]))));
registry.push(plugin('naddcommonsvideodownload', [], 'nadd-open-media', 'Download verified-license Commons video', '-naddcommonsvideodownload <File:...>', async(s,m,a,c)=>cliWithTemp(ccVideoCli,['commons-download',...a],[],s,chatIdOf(m,c)), { ownerOnly:true }));

/* ---------------- 20-site Python scraper ---------------- */
const multi=path.join(ENGINES,'20-sites-scrape','multisite_scraper.py');
const twentyIds=(fs.readFileSync(multi,'utf8').match(/\("([a-z0-9_]+)"\s*,/g)||[]).map(x=>x.match(/\("([a-z0-9_]+)/)[1]);
registry.push(plugin('nadd20sites', [], 'nadd-scrape', 'Run 20 public-site scraper sequentially', '-nadd20sites [only=a,b] [max=N]', async(s,m,a,c)=>{
  const only=a.find(x=>x.startsWith('only=')); const max=a.find(x=>x.startsWith('max=')); const args=['--max',String(Math.min(5,Math.max(1,Number(max?.split('=')[1])||3))),'--delay','1.5','--workers','1']; if(only) args.push('--only',only.slice(5)); const out=fs.mkdtempSync(path.join(TEMP_ROOT,'20sites-')); args.push('--out',out); try { const r=await runPythonScript(multi,args,{timeoutMs:180000}); const idx=path.join(out,'index.json'); const summary=fs.existsSync(idx)?JSON.parse(fs.readFileSync(idx,'utf8')):[]; await send(s,chatIdOf(m,c),`${outputOf(r)}\n\n${summary.map(x=>`${x.key}: ${x.status}, ${x.articles} articles`).join('\n')}`.slice(0,12000)); } finally { try{fs.rmSync(out,{recursive:true,force:true});}catch{} }
},{ownerOnly:true}));
registry.push(plugin('nadd20site', [], 'nadd-scrape', 'Scrape one of the 20 sites', '-nadd20site <site> [max=N]', async(s,m,a,c)=>{
  const site=a[0]; if(!site||!twentyIds.includes(site)) return send(s,chatIdOf(m,c),`Usage: -nadd20site <site> [max=N]\nSites: ${twentyIds.join(', ')}`); const max=a.find(x=>x.startsWith('max=')); const out=fs.mkdtempSync(path.join(TEMP_ROOT,'20site-')); try { const r=await runPythonScript(multi,['--max',String(Math.min(5,Math.max(1,Number(max?.split('=')[1])||3))),'--delay','1.5','--workers','1','--only',site,'--out',out],{timeoutMs:120000}); await send(s,chatIdOf(m,c),outputOf(r)); } finally {try{fs.rmSync(out,{recursive:true,force:true});}catch{}};
},{ownerOnly:true}));
registry.push(plugin('nadd20list', [], 'nadd-scrape', 'List the 20 multiscraper source ids', '-nadd20list', async(s,m,a,c)=>send(s,chatIdOf(m,c),twentyIds.join(', '))));

/* ---------------- scrape100 CLI ---------------- */
const scrapeRoot=path.join(ENGINES,'scrape100'); const scrapeCli=path.join(scrapeRoot,'cli.cjs');
const scrapeMap={scrape:'naddscrape',scrapeall:'naddscrapeall',scrapestatus:'naddscrapestatus',scrapefailed:'naddscrapefailed',scrapecategory:'naddscrapecategory',scrapecountry:'naddscrapecountry',scrapesearch:'naddscrapesearch',health:'naddscrapehealth',schedule:'naddscrapeschedule'};
for(const [src,name] of Object.entries(scrapeMap)) registry.push(plugin(name, [], 'nadd-scrape', `scrape100: ${src}`, `-${name}`, async(s,m,a,c)=>runAndReply(s,chatIdOf(m,c),()=>runNodeScript(scrapeCli,[src,...a],{env:{DB_FILE:path.join(TEMP_ROOT,'scrape100.db'),DATA_DIR:path.join(TEMP_ROOT,'scrape100-data'),LOG_DIR:path.join(TEMP_ROOT,'scrape100-logs')},timeoutMs: src==='scrapeall'?300000:120000})), {ownerOnly: src!=='health'}));

/* --------------------------------------------------------------------------
 * NADD ACCESS POLICY
 * --------------------------------------------------------------------------
 * Every NADD command is restricted to the configured owner set. The ABIX
 * permission layer resolves both the primary owner and every configured
 * secondary owner into `context.isOwner`, so ownerOnly=true intentionally
 * permits PRIMARY + SECONDARY owners and blocks ordinary users/admins.
 * Keep this as a final guard so future NADD commands added to this bridge
 * cannot accidentally become public.
 */
for (const command of registry) {
  command.ownerOnly = true;
  command.strictOwnerOnly = false;
  command.permission = 'OWNER';
}

module.exports = registry;
