const { fetchPack, sendPack } = require('../lib/telegramPack');
module.exports = {
  command: 'tgstk',
  aliases: ['telegram','tgsticker'],
  category: 'stickers',
  description: 'Download the complete Telegram sticker pack before sending',
  usage: '.tgstk <https://t.me/addstickers/PackName> | <Custom Pack Name>',
  async handler(sock, message, args, context={}) {
    const jid=context.chatId||message.key.remoteJid, prefix=context.prefix||'.';
    const raw=args.join(' ').trim();
    const url=(raw.match(/https?:\/\/t\.me\/addstickers\/[^\s|]+/i)||[])[0];
    if(!url) return sock.sendMessage(jid,{text:`📦 *TELEGRAM STICKER PACK*\n\n${prefix}tgstk <https://t.me/addstickers/PackName> | <Custom Pack Name>\n\nAll stickers are downloaded and converted first; sending starts only after the full pack is ready.`},{quoted:message});
    const custom=raw.split('|').slice(1).join('|').trim();
    try{
      await sock.sendMessage(jid,{react:{text:'⬇️',key:message.key}});
      await sock.sendMessage(jid,{text:'📦 Fetching sticker pack…\n⏳ Downloading and converting ALL stickers before sending.'},{quoted:message});
      const pack=await fetchPack(url,custom);
      if(pack.stickers.length!==pack.sourceCount) throw new Error(`Only ${pack.stickers.length}/${pack.sourceCount} stickers could be converted.`);
      await sock.sendMessage(jid,{react:{text:'📤',key:message.key}});
      const result=await sendPack(sock,jid,pack,{quoted:message});
      const status=result.mode==='native-pack' ? `✅ Sent as ${result.packsSent} native WhatsApp pack batch(es).` : '✅ Full pack downloaded and converted; this Baileys build does not expose native sticker-pack sending, so stickers were sent individually.';
      await sock.sendMessage(jid,{text:`${status}\n📦 *${pack.name}*\n🔢 Stickers: ${pack.stickers.length}`},{quoted:message});
      await sock.sendMessage(jid,{react:{text:'✅',key:message.key}});
    }catch(e){ console.error('[TGPACK]',e); await sock.sendMessage(jid,{react:{text:'❌',key:message.key}}).catch(()=>{}); await sock.sendMessage(jid,{text:`❌ Telegram pack failed.\n\n${e.message}\n\n💡 If this is an FFmpeg error, restart after \`npm ci --no-audit --no-fund\` or set FFMPEG_PATH to a working ffmpeg binary.`},{quoted:message}); }
  }
};
