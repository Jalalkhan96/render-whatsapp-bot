const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { renderTextTable } = require('../../lib/mediaExtras');

const SESSIONS = new Map();
const TTL = 20 * 60 * 1000;
const token = () => crypto.randomBytes(9).toString('hex');

function cleanup() {
  const now = Date.now();
  for (const [k, v] of SESSIONS) if (!v || now - v.createdAt > TTL) SESSIONS.delete(k);
}
setInterval(cleanup, 60_000).unref?.();

function clip(v, n = 120) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function fmt(v) {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US').format(n) : clip(v, 24);
}
function prefixOf(context = {}) { return String(context.prefix || process.env.BOT_PREFIX || '-'); }

function quick(displayText, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: displayText, id }) };
}
function copy(displayText, value) {
  return { name: 'cta_copy', buttonParamsJson: JSON.stringify({
    display_text: displayText,
    id: `copy_${Buffer.from(value).toString('hex').slice(0, 24)}`,
    copy_code: value,
  })};
}

function bizNode() {
  return {
    tag: 'biz',
    attrs: { actual_actors: '2', host_storage: '2', privacy_mode_ts: String(Math.floor(Date.now()/1000) - 77980457) },
    content: [
      { tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
}
function additionalNodes(jid) {
  const biz = bizNode();
  return jid.endsWith('@g.us') ? [biz] : [{ tag: 'bot', attrs: { biz_bot: '1' } }, biz];
}

async function fetchBuffer(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' }});
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length && b.length <= 8 * 1024 * 1024 ? b : null;
  } catch { return null; }
}
function findLocalImage() {
  const roots = [
    process.cwd(),
    path.join(process.cwd(),'assets'),
    path.join(process.cwd(),'media'),
    path.join(process.cwd(),'src','assets'),
    path.join(process.cwd(),'Sliderchecking','assets'),
  ];
  const names = ['menu.jpg','menu.jpeg','menu.png','menu.webp','bot.jpg','bot.png','bot.webp','slider.jpg','slider.png','thumbnail.jpg','thumbnail.png','menuImage.jpg','card1.jpg'];
  for (const root of roots) for (const name of names) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}
async function mediaHeader(sock, url) {
  const remote = await fetchBuffer(url);
  const local = findLocalImage();
  const image = remote || (local ? fs.readFileSync(local) : null);
  if (!image) return null;
  try {
    const p = await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
    return p?.imageMessage || null;
  } catch { return null; }
}

function store(session) {
  cleanup();
  const t = token();
  SESSIONS.set(t, { ...session, createdAt: Date.now() });
  return t;
}
function getSession(t) { cleanup(); return SESSIONS.get(String(t || '')) || null; }
function ownerKey(message, jid) { return message?.key?.participant || message?.key?.remoteJid || jid; }
function validSession(session, message, jid) {
  return Boolean(session && session.chatId === jid && (!session.owner || session.owner === ownerKey(message, jid)));
}

function normalizeItem(raw = {}, index = 0) {
  const authorObj = raw.author || raw.authorMeta || raw.owner || raw.user || {};
  const stats = raw.stats || raw.statistics || {};
  const media = raw.media || {};
  const page = raw.url || raw.page || raw.webVideoUrl || raw.videoWebUrl || raw.link || raw.sourceUrl || '';
  const title = raw.title || raw.text || raw.description || raw.desc || raw.name || `Result ${index + 1}`;
  const image = raw.thumbnail || raw.thumbnailUrl || raw.cover || raw.coverUrl || raw.image || raw.imageUrl || media.image || '';
  const video = raw.video || raw.videoUrl || raw.downloadUrl || raw.download_url || media.video || '';
  const audio = raw.audio || raw.audioUrl || raw.music || raw.musicUrl || media.audio || '';
  const author = typeof authorObj === 'string' ? authorObj : authorObj.name || authorObj.nickname || authorObj.username || authorObj.uniqueId || authorObj.unique_id || 'Unknown';
  return {
    raw, id: raw.id || raw.videoId || raw.postId || raw.aweme_id || page || String(index), page,
    title: clip(title,150), author: clip(author,60), thumbnail:image, video, audio,
    duration: raw.duration || raw.durationText || raw.length || '',
    views: stats.views ?? raw.views ?? raw.viewCount ?? raw.playCount,
    likes: stats.likes ?? raw.likes ?? raw.likeCount ?? raw.diggCount,
    comments: stats.comments ?? raw.comments ?? raw.commentCount,
    shares: stats.shares ?? raw.shares ?? raw.shareCount,
    reposts: stats.reposts ?? raw.reposts ?? raw.repostCount ?? raw.repost_count,
    saves: stats.saves ?? raw.saves ?? raw.saveCount ?? raw.collectCount ?? raw.collect_count,
    date: raw.date || raw.createdAt || raw.createTime || '',
  };
}

function makeCard({ item, index, total, command, tokenValue, prefix, buttons, titlePrefix }) {
  const statsTable = renderTextTable({
    title: '📊 TikTok Engagement',
    table: [
      ['Metric', 'Count'],
      ['Views', fmt(item.views)],
      ['Likes', fmt(item.likes)],
      ['Comments', fmt(item.comments)],
      ['Shares', fmt(item.shares)],
      ['Reposts', fmt(item.reposts)],
      ['Saves', fmt(item.saves)],
    ],
  });

  return {
    header: { title:`${titlePrefix} ${index+1}/${total}`, subtitle:item.author, hasMediaAttachment:Boolean(item._imageMessage),
      ...(item._imageMessage ? { imageMessage:item._imageMessage } : {}) },
    body: { text:
      `🎬 *${clip(item.title,130)}*\n\n` +
      `👤 ${clip(item.author,55)}\n` +
      (item.duration ? `⏱️ ${clip(item.duration,24)}\n` : '') +
      (item.date ? `📅 ${clip(item.date,32)}\n` : '') +
      `\n${statsTable}\n\nSelect an action below.` },
    footer: { text:'ABIX-AE • Swipe left/right' },
    nativeFlowMessage: {
      buttons: buttons.map(b => b.type === 'copy'
        ? copy(b.text,b.value)
        : quick(b.text, `${prefix}${command} __button ${b.action} ${tokenValue} ${index}`)),
      messageParamsJson:'', messageVersion:1,
    },
  };
}

async function sendCarousel({sock,message,jid,query,command,items,prefix,title,buttonFactory}) {
  const selected = (items || []).map(normalizeItem).slice(0,5);
  if (!selected.length) throw new Error('No usable results found.');
  const tokenValue = store({ chatId:jid, owner:ownerKey(message,jid), command, query, items:selected });
  const cards = [];
  for (let i=0;i<selected.length;i++) {
    const item = selected[i];
    item._imageMessage = await mediaHeader(sock,item.thumbnail);
    cards.push(makeCard({item,index:i,total:selected.length,command,tokenValue,prefix,buttons:buttonFactory(item,i),titlePrefix:title}));
  }
  const carousel = proto.Message.InteractiveMessage.CarouselMessage.fromObject({cards,messageVersion:1,carouselCardType:1});
  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body:{text:`🔎 *${title}*\n\nSearch: *${clip(query,120)}*\nResults: *${selected.length}*\n\n👈 Swipe left/right 👉`},
    footer:{text:`ABIX-AE • ${title}`}, carouselMessage:carousel,
  });
  const generated = generateWAMessageFromContent(jid,{viewOnceMessage:{message:{
    messageContextInfo:{deviceListMetadata:{},deviceListMetadataVersion:2},interactiveMessage,
  }}},{quoted:message,userJid:sock.user?.id});
  await sock.relayMessage(jid,generated.message,{messageId:generated.key.id,additionalNodes:additionalNodes(jid)});
  return tokenValue;
}

async function handleButton({sock,message,jid,args}) {
  const action=String(args[1]||'').toLowerCase(), tokenValue=String(args[2]||''), index=Number(args[3]);
  const session=getSession(tokenValue);
  if (!validSession(session,message,jid) || !Number.isInteger(index))
    return sock.sendMessage(jid,{text:'❌ This search button has expired or is not valid.'},{quoted:message});
  const item=session.items[index];
  if (!item) return sock.sendMessage(jid,{text:'❌ Result no longer exists.'},{quoted:message});
  if (action==='open' || action==='copy')
    return sock.sendMessage(jid,{text:item.page || '❌ No source URL available.'},{quoted:message});
  if (action==='audio' || action==='video') {
    const url=action==='audio'?item.audio:item.video;
    if (!url) return sock.sendMessage(jid,{text:`❌ ${action==='audio'?'Audio':'Video'} is not available from the provider.\n\n🔗 ${item.page||'No source URL'}`},{quoted:message});
    if (action==='audio') return sock.sendMessage(jid,{audio:{url},mimetype:'audio/mpeg',ptt:false},{quoted:message});
    return sock.sendMessage(jid,{video:{url},mimetype:'video/mp4',caption:`🎬 *${item.title}*\n👤 ${item.author}`},{quoted:message});
  }
  return sock.sendMessage(jid,{text:`🔗 ${item.page||'No source URL available.'}`},{quoted:message});
}

async function sendCardCarousel({ sock, message, jid, body, footer, cards }) {
  const carousel = proto.Message.InteractiveMessage.CarouselMessage.fromObject({
    cards, messageVersion: 1, carouselCardType: 1,
  });
  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: body },
    footer: { text: footer || 'ABIX-AE' },
    carouselMessage: carousel,
  });
  const generated = generateWAMessageFromContent(jid, {
    viewOnceMessage: { message: {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage,
    }},
  }, { quoted: message, userJid: sock.user?.id });
  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: additionalNodes(jid),
  });
}

module.exports={clip,fmt,prefixOf,quick,copy,normalizeItem,sendCarousel,sendCardCarousel,handleButton};
