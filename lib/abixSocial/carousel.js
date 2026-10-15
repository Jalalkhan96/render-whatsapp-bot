const fs = require('fs');
const path = require('path');
const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

const ASSET_DIR = path.join(__dirname, '..', '..', 'assets');
const sessions = new Map();

function fmt(n) {
  if (n === null || n === undefined || n === '') return '0';
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  if (x >= 1e9) return (x/1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (x >= 1e6) return (x/1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (x >= 1e3) return (x/1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(x));
}

function clean(s, max = 110) {
  return String(s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function imageBuffer(value, fallbackName) {
  if (Buffer.isBuffer(value)) return value;
  if (value) {
    try {
      if (/^https?:\/\//i.test(value)) {
        const r = await fetch(value, { redirect: 'follow' });
        if (r.ok) return Buffer.from(await r.arrayBuffer());
      } else if (fs.existsSync(value)) {
        return fs.readFileSync(value);
      }
    } catch {}
  }
  const fallback = path.join(ASSET_DIR, fallbackName);
  return fs.existsSync(fallback) ? fs.readFileSync(fallback) : null;
}

function qr(text, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) };
}

function node(tag, attrs = {}, content) {
  return { tag, attrs, content };
}

function additionalNodes(jid) {
  return [node('biz', {}, [node('interactive', { type: 'native_flow', v: '1' }, [])])];
}

function buttonId(command, token, action, index) {
  return `${command} __button ${action} ${token} ${index}`;
}

function remember(jid, token, results) {
  let bucket = sessions.get(jid);
  if (!bucket) sessions.set(jid, bucket = new Map());
  bucket.set(token, { results, expires: Date.now() + 15 * 60 * 1000 });
  while (bucket.size > 20) bucket.delete(bucket.keys().next().value);
}

function getSession(jid, token) {
  const x = sessions.get(jid)?.get(token);
  if (!x || x.expires < Date.now()) return null;
  return x;
}

async function sendCarousel(sock, jid, command, platform, query, results) {
  if (!Array.isArray(results) || results.length < 5) throw new Error(`Only ${results?.length || 0} usable results were returned; 5 are required for the slider.`);
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  remember(jid, token, results.slice(0, 5));

  const cards = [];
  for (let i = 0; i < 5; i++) {
    const r = results[i];
    const image = await imageBuffer(r.thumb, `card${(i % 5) + 1}.png`);
    if (!image) continue;
    const media = await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
    const stats = `👁 ${fmt(r.stats?.views)}   ❤️ ${fmt(r.stats?.likes)}   💬 ${fmt(r.stats?.comments)}   ↗️ ${fmt(r.stats?.shares)}`;
    const body = `╭─〔 ${platform.toUpperCase()} RESULT ${i + 1}/5 〕\n│ 👤 ${clean(r.author, 42)}\n│ ${clean(r.title, 115)}\n│ ${stats}\n╰────────────────`;
    const buttons = [qr('🔗 OPEN', buttonId(command, token, 'open', i))];
    if (r.video) buttons.push(qr('🎬 VIDEO', buttonId(command, token, 'video', i)));
    if (r.audio) buttons.push(qr('🎧 AUDIO', buttonId(command, token, 'audio', i)));
    cards.push({ header: proto.Message.InteractiveMessage.Header.fromObject({ title: platform.toUpperCase(), hasMediaAttachment: true, imageMessage: media.imageMessage }), body: proto.Message.InteractiveMessage.Body.fromObject({ text: body }), footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `ABIX-AE • ${query}` }), nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons }) });
  }

  if (cards.length < 5) throw new Error(`Only ${cards.length}/5 slider cards could be prepared.`);
  const carousel = proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards, messageVersion: 1, carouselCardType: 1 });
  const msg = generateWAMessageFromContent(jid, { viewOnceMessage: { message: { interactiveMessage: proto.Message.InteractiveMessage.fromObject({ body: { text: `🔎 ${platform.toUpperCase()} SEARCH\n\nQuery: ${query}\nResults: 5` }, carouselMessage: carousel, header: { title: `ABIX-AE ${platform.toUpperCase()}` } }) } } }, { userJid: jid, quoted: undefined });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: additionalNodes(jid) });
  return token;
}

async function handleButton(sock, jid, token, action, index) {
  const session = getSession(jid, token);
  if (!session) return false;
  const r = session.results[Number(index)];
  if (!r) return false;
  if (action === 'open') {
    if (!r.url) return false;
    await sock.sendMessage(jid, { text: `🔗 ${r.url}` });
    return true;
  }
  const url = action === 'audio' ? r.audio : r.video;
  if (!url) { await sock.sendMessage(jid, { text: `⚠️ ${action.toUpperCase()} is not available for this result.` }); return true; }
  if (action === 'audio') await sock.sendMessage(jid, { audio: { url }, mimetype: 'audio/mpeg' });
  else await sock.sendMessage(jid, { video: { url }, caption: `🎬 ${clean(r.title, 150)}` });
  return true;
}

function extractButtonId(message, context = {}) {
  if (context.buttonId) return context.buttonId;
  const m = message?.message || message;
  const p = m?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (p) { try { const j = JSON.parse(p); return j.id || j.button_id || ''; } catch {} }
  return m?.buttonsResponseMessage?.selectedButtonId || m?.templateButtonReplyMessage?.selectedId || '';
}

async function sendMenuCarousel(sock, jid) {
  const cards = [
    ['🧰 MEDIA TOOLS','Download, convert and manage media.','-ttsearch cats'],
    ['📚 SOCIAL SEARCH','Search TikTok, Instagram, Facebook, Reddit and Pinterest.','-igsearch Ronaldo Edit'],
    ['▶️ VIDEO SEARCH','YouTube and other video discovery tools.','-ytsearch cats'],
    ['💼 PROFESSIONAL','LinkedIn people and jobs search.','-linkedinpeople software engineer'],
    ['🌐 MORE SEARCH','X, Threads and Snapchat search tools.','-xsearch cats']
  ];
  const built = [];
  for (let i=0;i<cards.length;i++) {
    const image = await imageBuffer(null, `card${i+1}.png`);
    const media = await prepareWAMessageMedia({image}, {upload:sock.waUploadToServer});
    const [title, desc, example] = cards[i];
    const buttons = [
      qr('📂 OPEN MENU', `slidermenu __button open ${i}`),
      qr('▶️ TRY COMMAND', `slidermenu __button try ${i}`)
    ];
    built.push({
      header: proto.Message.InteractiveMessage.Header.fromObject({title, hasMediaAttachment:true, imageMessage:media.imageMessage}),
      body: proto.Message.InteractiveMessage.Body.fromObject({text:`${desc}\n\nExample: ${example}`}),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({text:'ABIX-AE'}),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({buttons})
    });
  }
  const carousel = proto.Message.InteractiveMessage.CarouselMessage.fromObject({cards:built, messageVersion:1, carouselCardType:1});
  const msg = generateWAMessageFromContent(jid, {viewOnceMessage:{message:{interactiveMessage:proto.Message.InteractiveMessage.fromObject({body:{text:'✨ ABIX-AE MENU\n\nSwipe the cards to browse the bot.'},carouselMessage:carousel,header:{title:'ABIX-AE'}})}}}, {userJid:jid});
  await sock.relayMessage(jid,msg.message,{messageId:msg.key.id,additionalNodes:additionalNodes(jid)});
}

module.exports = { sendCarousel, sendMenuCarousel, handleButton, extractButtonId };
