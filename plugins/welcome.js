'use strict';

const { handleWelcome } = require('../lib/welcome');
const { isWelcomeOn, getWelcome } = require('../lib/index');
const { makeGreeting } = require('../plugin3/greetingAdapter');
const { getWelcomeMedia, renderWelcomeCard, fetchImageBuffer } = require('../lib/welcomeMedia');
const { getWelcomeStyleConfig, renderWelcomeStyle, formatTime } = require('../lib/welcomeStyles');
const fs = require('fs');

module.exports = {
  command: 'welcome',
  aliases: ['setwelcome'],
  category: 'admin',
  description: 'Configure welcome message for the group',
  usage: '.welcome [on/off/message]',
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context) {
    const { chatId } = context;
    await handleWelcome(sock, chatId, message, args.join(' '));
  },
};

async function getDisplayName(sock, groupMetadata, participantString) {
  const direct = String(participantString || '').split('@')[0];
  const entries = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : [];
  const found = entries.find((p) => String(p?.id || '') === String(participantString));
  if (found?.name || found?.notify) return String(found.name || found.notify);

  try {
    const contact = await sock.getBusinessProfile(participantString);
    if (contact?.name) return String(contact.name);
  } catch {}

  return direct || 'Member';
}

async function handleJoinEvent(sock, id, participants) {
  if (!(await isWelcomeOn(id))) return;

  const customMessage = await getWelcome(id);
  const groupMetadata = await sock.groupMetadata(id);
  const groupName = groupMetadata?.subject || 'Group';
  const groupDesc = groupMetadata?.desc || '';
  const welcomeMedia = getWelcomeMedia(id);
  const styleConfig = await getWelcomeStyleConfig(id);
  const memberCount = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants.length : 0;

  for (const participant of participants || []) {
    const participantString = typeof participant === 'string' ? participant : (participant?.id || String(participant));
    if (!participantString) continue;

    try {
      const displayName = await getDisplayName(sock, groupMetadata, participantString);
      const userTag = `@${displayName}`;
      const timeString = formatTime();
      const fallbackCustom = customMessage
        ? customMessage
            .replace(/{user}/g, userTag)
            .replace(/{group}/g, groupName)
            .replace(/{description}/g, groupDesc)
            .replace(/{count}/g, String(memberCount))
            .replace(/{time}/g, timeString)
        : null;

      const finalMessage = fallbackCustom || [
        renderWelcomeStyle(styleConfig.welcomeStyle, {
          user: userTag,
          group: groupName,
          count: memberCount,
          time: timeString,
          description: groupDesc,
        }),
        '',
        makeGreeting(displayName),
      ].join('\n');

      let avatarBuffer = null;
      try {
        const profilePicUrl = await sock.profilePictureUrl(participantString, 'image');
        if (profilePicUrl) avatarBuffer = await fetchImageBuffer(profilePicUrl);
      } catch {}

      let backgroundBuffer = null;
      if (welcomeMedia?.path) {
        try { backgroundBuffer = fs.readFileSync(welcomeMedia.path); } catch {}
      }

      try {
        const cardBuffer = await renderWelcomeCard({
          backgroundBuffer,
          avatarBuffer,
          groupName,
          displayName,
          memberCount,
          timeString,
        });

        // Normal image message; no fake-forward/channel metadata.
        await sock.sendMessage(id, {
          image: cardBuffer,
          caption: finalMessage,
          mentions: [participantString],
        });
        continue;
      } catch (renderError) {
        console.error('[WELCOME CARD] render failed:', renderError.message);
      }

      if (backgroundBuffer) {
        await sock.sendMessage(id, {
          image: backgroundBuffer,
          caption: finalMessage,
          mentions: [participantString],
        });
      } else {
        await sock.sendMessage(id, {
          text: finalMessage,
          mentions: [participantString],
        });
      }
    } catch (error) {
      console.error('[WELCOME] Error sending event:', error);
      try {
        const user = String(participantString).split('@')[0];
        await sock.sendMessage(id, {
          text: `✦ Welcome @${user} to *${groupName}*! ✦\n👥 Members: *${memberCount}*\n🕒 ${formatTime()}`,
          mentions: [participantString],
        });
      } catch {}
    }
  }
}

module.exports.handleJoinEvent = handleJoinEvent;
