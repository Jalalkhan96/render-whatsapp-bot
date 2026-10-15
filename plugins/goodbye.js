'use strict';

const { handleGoodbye } = require('../lib/welcome');
const { isGoodByeOn, getGoodbye } = require('../lib/index');
const { getWelcomeStyleConfig, renderGoodbyeStyle, formatTime } = require('../lib/welcomeStyles');

async function getDisplayName(sock, groupMetadata, participantString) {
  const direct = String(participantString || '').split('@')[0];
  const entries = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : [];
  const found = entries.find((p) => String(p?.id || '') === String(participantString));
  return String(found?.name || found?.notify || direct || 'Member');
}

async function handleLeaveEvent(sock, id, participants) {
  if (!(await isGoodByeOn(id))) return;

  const customMessage = await getGoodbye(id);
  const groupMetadata = await sock.groupMetadata(id);
  const groupName = groupMetadata?.subject || 'Group';
  const config = await getWelcomeStyleConfig(id);
  const rawMemberCount = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants.length : 0;
  const leavingCount = Array.isArray(participants) ? participants.length : 0;
  const membersNow = Math.max(0, rawMemberCount - leavingCount);

  for (const participant of participants || []) {
    const participantString = typeof participant === 'string' ? participant : (participant?.id || String(participant));
    if (!participantString) continue;

    try {
      const displayName = await getDisplayName(sock, groupMetadata, participantString);
      const userTag = `@${displayName}`;
      const time = formatTime();
      const finalMessage = customMessage
        ? customMessage
            .replace(/{user}/g, userTag)
            .replace(/{group}/g, groupName)
            .replace(/{count}/g, String(membersNow))
            .replace(/{time}/g, time)
        : renderGoodbyeStyle(config.goodbyeStyle, {
            user: userTag,
            group: groupName,
            count: membersNow,
            time,
          });

      // Normal WhatsApp message. No fake-forward/newsletter/channel metadata.
      await sock.sendMessage(id, {
        text: finalMessage,
        mentions: [participantString],
      });
    } catch (error) {
      console.error('[GOODBYE] Error sending event:', error);
      try {
        await sock.sendMessage(id, {
          text: `👋 Goodbye @${String(participantString).split('@')[0]} from *${groupName}*.\n👥 Members: *${membersNow}*\n🕒 ${formatTime()}`,
          mentions: [participantString],
        });
      } catch {}
    }
  }
}

module.exports = {
  command: 'goodbye',
  aliases: ['bye', 'leave'],
  category: 'admin',
  description: 'Configure styled goodbye messages for leaving members',
  usage: '.goodbye <on|off|set message>',
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const matchText = args.join(' ');
    await handleGoodbye(sock, chatId, message, matchText);
  },

  handleLeaveEvent,
};
