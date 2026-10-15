import { findMediaInMessage, downloadMediaBuffer } from '../whatsapp-ui/mediaExtract.js';
import { setMenuMedia, clearMenuMedia } from '../whatsapp-ui/menuMedia.js';

/**
 * Sets or clears the media shown as the /menu header.
 * Usage:
 *   Send an image/video/gif with caption "/setmenumedia" (or your prefix)
 *   OR reply to an image/video/gif with "/setmenumedia"
 *   "$setmenumedia clear" removes the current media.
 *
 * @param {object} ctx - same shape as commands/menu.js sendMenu()
 */
export async function setMenuMediaCommand(ctx) {
  const { sock, args = [] } = ctx;
  const jid = ctx.jid || ctx.from;
  const msg = ctx.msg || ctx.quoted;

  const reply = (text) => sock.sendMessage(jid, { text }, msg ? { quoted: msg } : undefined);

  if (args[0]?.toLowerCase() === 'clear') {
    clearMenuMedia();
    return reply('✅ Menu media cleared. The menu will show a plain header again.');
  }

  const found = msg ? findMediaInMessage(msg) : null;

  if (!found) {
    return reply(
      [
        '🖼️ *Set Menu Media*',
        '',
        'Attach an image, video, or gif with this command as the caption,',
        'or reply to one with this command.',
        '',
        'Use "clear" as an argument to remove the current menu media.',
      ].join('\n')
    );
  }

  try {
    const buffer = await downloadMediaBuffer(found.type, found.mediaMessage);
    setMenuMedia(found.type, buffer);
    return reply(`✅ Menu media updated (${found.type}). Run $menu to preview it.`);
  } catch (err) {
    return reply(`❌ Could not save menu media: ${err.message}`);
  }
}

export default {
  name: 'setmenumedia',
  aliases: ['setmenupic', 'setmenuimg', 'setmenuvideo', 'setmenugif'],
  description: 'Set the image/video/gif shown on the /menu header',
  category: 'owner',
  ownerOnly: true,
  async execute(ctx) {
    return setMenuMediaCommand(ctx);
  },
};
