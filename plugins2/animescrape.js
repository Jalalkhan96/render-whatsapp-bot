'use strict';

const crypto = require('crypto');
const scraper = require('../lib/animePublicScraper.cjs');

const sessions = new Map();
const TTL = 5 * 60 * 1000;

function t(v='') { return String(v).replace(/\s+/g,' ').trim(); }
function jidOf(m,c){ return c?.chatId || m?.key?.remoteJid; }
function prefixOf(c){ return c?.prefix || '-'; }
function sourceLabel(s){
  return ({
    mal:'MyAnimeList', anilist:'AniList', animeplanet:'Anime-Planet', kitsu:'Kitsu',
    anidb:'AniDB', ann:'Anime News Network', mangaupdates:'MangaUpdates',
    mangadex:'MangaDex', jikan:'Jikan/MAL public pages'
  })[s] || s;
}

function formatItems(items, query, token, failures={}) {
  const lines = [`🍥 *ABIX ANIME / MANGA SCRAPER*`, `🔎 ${query}`, ''];
  items.slice(0, 18).forEach((x,i)=>{
    lines.push(`${i+1}. ${sourceLabel(x.sourceKey)} — *${t(x.title).slice(0,90)}*`);
    lines.push(`   🔗 ${x.url}`);
    if (x.description) lines.push(`   📝 ${t(x.description).slice(0,180)}`);
    lines.push('');
  });
  if (Object.keys(failures).length) {
    lines.push(`⚠️ Unavailable: ${Object.keys(failures).map(sourceLabel).join(', ')}`);
  }
  lines.push('', `Session: ${token}`, `Use ${prefixOf({})}animeget ${token} <number> in this chat.`);
  return lines.join('\n');
}

async function doSearch(sock,message,args,context,source='all') {
  const jid = jidOf(message,context);
  const query = t(args.join(' '));
  if (!query) return sock.sendMessage(jid,{text:`Usage: ${prefixOf(context)}${source==='all'?'animuscrape <query>':source+'scrape <query>'}`},{quoted:message});
  await sock.sendMessage(jid,{react:{text:'🍥',key:message.key}}).catch(()=>{});
  try {
    let items=[], failures={};
    if (source === 'all') ({items,failures} = await scraper.searchAll(query,{limit:6}));
    else items = await scraper.searchSource(source,query,{limit:8});
    if (!items.length) throw new Error('No public results could be extracted from the selected site(s).');
    const token = crypto.randomBytes(5).toString('hex');
    sessions.set(`${jid}:${token}`,{createdAt:Date.now(),items,query});
    setTimeout(()=>sessions.delete(`${jid}:${token}`),TTL).unref?.();
    return sock.sendMessage(jid,{text:formatItems(items,query,token,failures)},{quoted:message});
  } catch (e) {
    return sock.sendMessage(jid,{text:`❌ Public anime scrape failed.\n\n${e.message}`},{quoted:message});
  } finally {
    await sock.sendMessage(jid,{react:{text:'✅',key:message.key}}).catch(()=>{});
  }
}

async function getResult(sock,message,args,context) {
  const jid=jidOf(message,context); const token=t(args[0]); const index=Number(args[1])-1;
  const state=sessions.get(`${jid}:${token}`);
  if (!state || Date.now()-state.createdAt>TTL) return sock.sendMessage(jid,{text:'❌ Search session expired. Run the search again.'},{quoted:message});
  if (!Number.isInteger(index) || index<0 || !state.items[index]) return sock.sendMessage(jid,{text:`Usage: ${prefixOf(context)}animeget <session> <number>`},{quoted:message});
  const x=state.items[index];
  const info = await scraper.scrapeUrl(x.url,x.sourceKey).catch(()=>null);
  const lines=[`🍥 *${t(x.title||'Result')}*`,`🌐 ${sourceLabel(x.sourceKey)}`,`🔗 ${x.url}`];
  if (x.image) lines.push(`🖼️ ${x.image}`);
  if (info?.description || x.description) lines.push('',`📝 ${t(info?.description || x.description).slice(0,2500)}`);
  return sock.sendMessage(jid,{text:lines.join('\n')},{quoted:message});
}

async function direct(sock,message,args,context) {
  const jid=jidOf(message,context); const url=t(args.join(' '));
  if (!/^https?:\/\//i.test(url)) return sock.sendMessage(jid,{text:`Usage: ${prefixOf(context)}animeurl <public anime/manga URL>`},{quoted:message});
  try {
    const x=await scraper.scrapeUrl(url);
    const lines=[`🍥 *${t(x.title||'Anime/Manga')}*`,`🌐 ${sourceLabel(x.sourceKey)}`,`🔗 ${x.url}`];
    if (x.image) lines.push(`🖼️ ${x.image}`);
    if (x.description) lines.push('',`📝 ${t(x.description).slice(0,2500)}`);
    return sock.sendMessage(jid,{text:lines.join('\n')},{quoted:message});
  } catch(e) { return sock.sendMessage(jid,{text:`❌ ${e.message}`},{quoted:message}); }
}

const src = [
  ['malscrape','mal',['malsearch','myanimelistsearch']],
  ['anilistscrape','anilist',['anilistsearch','alsearch']],
  ['animeplanetscrape','animeplanet',['animeplanetsearch','apsearch']],
  ['kitsuscrape','kitsu',['kitsusearch','kitsearch']],
  ['anidbscrape','anidb',['anidbsearch','adbsearch']],
  ['annscrape','ann',['annsearch','animesnews']],
  ['muscrape','mangaupdates',['mangaupdatessearch','musearch']],
  ['mangadexscrape','mangadex',['mangadexsearch','mdsearch']],
  ['jikanscrape','jikan',['jikansearch','jikanmal']],
];

const commands = [
  {command:'animuscrape',aliases:['animescrape','animeweb','animemeta'],category:'anime',description:'Search public anime/manga sites without API keys',usage:'.animuscrape <query>',handler:(s,m,a,c)=>doSearch(s,m,a,c,'all')},
  {command:'animeget',aliases:['animeresult','animeres'],category:'anime',description:'Open a result from an anime scraper session',usage:'.animeget <session> <number>',handler:getResult},
  {command:'animeurl',aliases:['animeinfo','mangainfo'],category:'anime',description:'Scrape a public anime/manga page directly',usage:'.animeurl <url>',handler:direct},
];
for (const [command,source,aliases] of src) {
  commands.push({command,aliases,category:'anime',description:`Scrape public ${sourceLabel(source)} pages without API keys`,usage:`.${command} <query>`,handler:(s,m,a,c)=>doSearch(s,m,a,c,source)});
}

commands.push({
  command:'animesites',
  aliases:['animescrapemenu','animusites'],
  category:'anime',
  description:'List the public no-API anime/manga scraper sources',
  usage:'.animesites',
  handler:async (sock,message,args,context)=>sock.sendMessage(jidOf(message,context),{text:[
    '🍥 *ABIX NO-API ANIME SOURCES*','',
    '1. MyAnimeList — -malscrape','2. AniList — -anilistscrape','3. Anime-Planet — -animeplanetscrape',
    '4. Kitsu — -kitsuscrape','5. AniDB — -anidbscrape','6. Anime News Network — -annscrape',
    '7. MangaUpdates — -muscrape','8. MangaDex — -mangadexscrape','9. Jikan/MAL public pages — -jikanscrape',
    '',`All sources: ${prefixOf(context)}animuscrape <query>`
  ].join('\n')},{quoted:message})
});

module.exports = commands;
