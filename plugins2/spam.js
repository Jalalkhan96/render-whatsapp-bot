const store = require('../lib/lightweight_store');
const { protectedTarget, addWarning, clearWarning } = require('./moderation-store');

const buckets = new Map();
const violations = new Map();
const DEFAULTS = { enabled:false, limit:5, windowMs:6000, action:'delete_warn', cooldownMs:8000 };

async function getConfig(chatId){ return { ...DEFAULTS, ...(await store.getSetting(chatId,'antispam') || {}) }; }
async function saveConfig(chatId,cfg){ await store.saveSetting(chatId,'antispam',cfg); }
function senderKey(chatId,senderId){ return `${chatId}:${String(senderId||'').split(':')[0]}`; }

async function handleSpamDetection(sock, chatId, message, senderId, meta={}) {
  if(!String(chatId).endsWith('@g.us') || message?.key?.fromMe) return false;
  const cfg=await getConfig(chatId); if(!cfg.enabled) return false;
  const key=senderKey(chatId,senderId); const now=Date.now();
  const bucket=(buckets.get(key)||[]).filter(t=>now-t<=Math.max(1000,Number(cfg.windowMs)||DEFAULTS.windowMs));
  bucket.push(now); buckets.set(key,bucket);
  if(bucket.length < Math.max(2,Number(cfg.limit)||DEFAULTS.limit)) return false;
  buckets.set(key,[]);
  const guard=await protectedTarget(sock,chatId,senderId);
  if(guard.protected) return false;
  const last=violations.get(key)||0;
  if(now-last < Math.max(1000,Number(cfg.cooldownMs)||DEFAULTS.cooldownMs)) return true;
  violations.set(key,now);
  const action=String(cfg.action||DEFAULTS.action).toLowerCase();
  try {
    if(['delete','delete_warn','kick'].includes(action)) await sock.sendMessage(chatId,{delete:message.key});
    if(['warn','delete_warn'].includes(action)) {
      const count=await addWarning(chatId,senderId);
      await sock.sendMessage(chatId,{text:`🛑 *ANTI-SPAM* @${String(senderId).split('@')[0]}\nMessages were too fast (${cfg.limit} in ${Math.round(cfg.windowMs/1000)}s). Warning: ${count}/3`,mentions:[senderId]});
      if(count>=3 && action==='delete_warn') { try { await sock.groupParticipantsUpdate(chatId,[senderId],'remove'); await clearWarning(chatId,senderId); } catch {} }
    }
    if(action==='kick') { try { await sock.groupParticipantsUpdate(chatId,[senderId],'remove'); } catch(e){ await sock.sendMessage(chatId,{text:'⚠️ Spam detected but kick failed. Make sure I am admin.'}); } }
    return true;
  } catch(e){ console.error('[ANTISPAM]',e.message); return false; }
}

module.exports = {
  command:'spam', aliases:['antispam','antiflood','flood'], category:'moderation', description:'Configure anti-spam / anti-flood protection', usage:'-spam on|off|status|set 5 6 delete_warn', groupOnly:true, adminOnly:true,
  async handler(sock,message,args,context={}) {
    const chatId=context.chatId || message.key.remoteJid; const sub=String(args[0]||'status').toLowerCase(); const cfg=await getConfig(chatId);
    if(sub==='on'||sub==='enable'){cfg.enabled=true; await saveConfig(chatId,cfg); return sock.sendMessage(chatId,{text:'✅ Anti-spam enabled. Default: 5 messages / 6 seconds.'},{quoted:message});}
    if(sub==='off'||sub==='disable'){cfg.enabled=false; await saveConfig(chatId,cfg); return sock.sendMessage(chatId,{text:'❌ Anti-spam disabled.'},{quoted:message});}
    if(sub==='set'){
      const limit=Math.max(2,Math.min(50,Number(args[1])||cfg.limit)); const seconds=Math.max(2,Math.min(120,Number(args[2])||cfg.windowMs/1000)); const action=['delete','warn','delete_warn','kick'].includes(String(args[3]||cfg.action).toLowerCase())?String(args[3]||cfg.action).toLowerCase():cfg.action;
      cfg.limit=limit; cfg.windowMs=seconds*1000; cfg.action=action; await saveConfig(chatId,cfg);
      return sock.sendMessage(chatId,{text:`✅ *ANTI-SPAM UPDATED*\nStatus: ${cfg.enabled?'ON':'OFF'}\nLimit: ${limit} messages\nWindow: ${seconds}s\nAction: ${action}`},{quoted:message});
    }
    return sock.sendMessage(chatId,{text:`🛡️ *ANTI-SPAM*\nStatus: ${cfg.enabled?'✅ ON':'❌ OFF'}\nLimit: ${cfg.limit} msgs / ${Math.round(cfg.windowMs/1000)}s\nAction: ${cfg.action}\n\nCommands:\n• -spam on\n• -spam off\n• -spam set 5 6 delete_warn\n• -spam status`},{quoted:message});
  },
  handleSpamDetection
};
