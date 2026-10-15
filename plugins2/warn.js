const { targetFromMessage, getWarnings, addWarning, clearWarning, protectedTarget } = require('./moderation-store');

module.exports = [
  {
    command:'warn', aliases:['warning'], category:'moderation', description:'Warn a group member (3 warnings => auto kick)', usage:'-warn @user [reason]', groupOnly:true, adminOnly:true,
    async handler(sock, message, args, context={}) {
      const chatId=context.chatId || message.key.remoteJid;
      const target=targetFromMessage(message,args);
      if (!target) return sock.sendMessage(chatId,{text:'⚠️ Mention a user or reply to their message.\nUsage: -warn @user [reason]'},{quoted:message});
      const guard=await protectedTarget(sock,chatId,target);
      if (guard.protected) return sock.sendMessage(chatId,{text:`❌ Cannot warn ${guard.reason}.`},{quoted:message});
      const count=await addWarning(chatId,target);
      const reason=args.filter((x)=>!String(x).startsWith('@')).slice(context?.mentionedJid?.length || 0).join(' ').trim();
      await sock.sendMessage(chatId,{text:`⚠️ *WARNING ${count}/3*\n\n👤 @${String(target).split('@')[0]}\n${reason?`📝 ${reason}\n`:''}👮 Warned by: @${String(context.senderId||message.key.participant||'').split('@')[0]}`,mentions:[target,context.senderId].filter(Boolean)},{quoted:message});
      if (count >= 3) {
        try {
          await sock.groupParticipantsUpdate(chatId,[target],'remove');
          await clearWarning(chatId,target);
          await sock.sendMessage(chatId,{text:`🚫 @${String(target).split('@')[0]} removed after 3 warnings.`,mentions:[target]});
        } catch (e) {
          await sock.sendMessage(chatId,{text:`⚠️ 3/3 warnings reached, but I could not remove @${String(target).split('@')[0]}. Make sure I am admin.`,mentions:[target]});
        }
      }
    }
  },
  {
    command:'warnings', aliases:['warns','warninglist'], category:'moderation', description:'Show warnings for a user', usage:'-warnings @user', groupOnly:true, adminOnly:false,
    async handler(sock,message,args,context={}) {
      const chatId=context.chatId || message.key.remoteJid; const target=targetFromMessage(message,args);
      if(!target) return sock.sendMessage(chatId,{text:'Usage: -warnings @user (or reply to a user)'},{quoted:message});
      const warnings=await getWarnings(chatId); const count=Number(warnings[String(target)]||0);
      return sock.sendMessage(chatId,{text:`⚠️ *WARNINGS*\n\n👤 @${String(target).split('@')[0]}\n📊 ${count}/3`,mentions:[target]},{quoted:message});
    }
  },
  {
    command:'resetwarn', aliases:['unwarn','clearwarn'], category:'moderation', description:'Reset a user warning count', usage:'-resetwarn @user', groupOnly:true, adminOnly:true,
    async handler(sock,message,args,context={}) {
      const chatId=context.chatId || message.key.remoteJid; const target=targetFromMessage(message,args);
      if(!target) return sock.sendMessage(chatId,{text:'Usage: -resetwarn @user (or reply)'},{quoted:message});
      await clearWarning(chatId,target);
      return sock.sendMessage(chatId,{text:`✅ Warnings reset for @${String(target).split('@')[0]}.`,mentions:[target]},{quoted:message});
    }
  }
];

module.exports.addWarning = addWarning;
module.exports.getWarnings = getWarnings;
module.exports.clearWarning = clearWarning;
