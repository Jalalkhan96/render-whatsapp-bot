const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

function score(pw) {
  let s = 0;
  const len = pw.length;
  if (len >= 8) s += 1;
  if (len >= 12) s += 1;
  if (len >= 16) s += 1;
  if (/[a-z]/.test(pw)) s += 1;
  if (/[A-Z]/.test(pw)) s += 1;
  if (/[0-9]/.test(pw)) s += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) s += 1;
  if (/[0-9]/.test(pw) && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) s += 2;
  if (/(.)\1{2,}/.test(pw)) s -= 2;
  if (/^(password|123456|qwerty|admin|letmein|iloveyou|abc123)/i.test(pw)) s -= 3;
  return Math.max(0, Math.min(10, s));
}

module.exports = {
  command: 'passcheck',
  aliases: ['passwordcheck', 'pwdcheck', 'strength'],
  category: 'security',
  description: 'Test password strength (offline)',
  usage: '.passcheck <password>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const pw = (args[0] || '').trim();
    if (!pw) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter a password to test.\nExample: .passcheck myPass123!',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    if (pw.length > 100) {
      return await sock.sendMessage(chatId, {
        text: `❌ ${pw.length} chars — itna lamba password check nahi karta. 100 max.`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    const s = score(pw);
    const verdict = s <= 2 ? '🔴 VERY WEAK' : s <= 4 ? '🟠 WEAK' : s <= 6 ? '🟡 MEDIUM' : s <= 8 ? '🟢 STRONG' : '🟣 VERY STRONG';
    const bar = '█'.repeat(s) + '░'.repeat(10 - s);

    let notes = [];
    if (pw.length < 12) notes.push('📏 Length kam hai — 12+ chars use karo.');
    if (!/[A-Z]/.test(pw)) notes.push('🔠 Uppercase letter missing.');
    if (!/[0-9]/.test(pw)) notes.push('🔢 Digit missing.');
    if (!/[^a-zA-Z0-9]/.test(pw)) notes.push('🔣 Special symbol missing.');
    if (/(.)\1{2,}/.test(pw)) notes.push('🔁 Repeat chars hain — use karo alag chars.');
    if (/^(password|123456|qwerty|admin|letmein|iloveyou|abc123)/i.test(pw)) notes.push('‼️ Common/dictionary password.');

    const text =
      `⚡ *Password Strength*\n\n` +
      `${bar} ${s}/10\n\n` +
      `${verdict}\n\n` +
      (notes.length ? '⚠️ ' + notes.join('\n⚠️ ') : '🎉 Solid password!') +
      `\n\n🧠 Ye test offline hai — password kisi server pe nahi jaata.`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};