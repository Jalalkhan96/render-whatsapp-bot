const fs = require('fs');
const path = require('path');
const { botName: ABIX } = require('../../settings');

module.exports = {
  command: 'ffmenu',
  aliases: ['freemenu', 'freefiremenu', 'ffcommands', 'ffhelp'],
  category: 'esports',
  description: 'Shows all Free Fire commands',
  usage: '.ffmenu',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '.';

    const def = (cmd, desc) => `│   ${prefix}${cmd}\n│   └ ${desc}`;
    const rows = [
      def('ffinfo <uid>', 'Player ka full profile 📊'),
      def('ffcareer <uid>', 'Rank & career stats 🏆'),
      def('ffguild <uid>', 'Guild details 🛡️'),
      def('ffskills <uid>', 'Character & pet data 🧩'),
      def('ffcheck <uid>', 'Account ban/status 🔎'),
      def('ffcompare <uid1> <uid2>', 'Do players ka muqabla ⚔️'),
      def('ffme', 'Linked UID profile 👤'),
      def('ffsearch <name>', 'Players dhoondo by name 🔍')
    ].join('\n');
    const items = [
      def('ffitem <name>', 'Items ki talaash 📦'),
      def('ffwish <item>', 'Wishlist mein add karo 💫'),
      def('ffwishlist', 'Apni wishlist dekho 📋'),
      def('ffunwish <num>', 'Wishlist se hatao ➖'),
      def('ffclearwish', 'Wishlist khaali karo 🧹')
    ].join('\n');
    const link = [
      def('fflink <uid>', 'Apna UID link karo 🔗'),
      def('ffunlink', 'UID unlink karo 🔓')
    ].join('\n');
    const style = [
      def('ffname <name>', 'Stylish FF names ✨'),
      def('ffdecorate <name>', 'Name decoration 🎨'),
      def('fakeffduo <n1> <n2>', 'FF duo image 🎮')
    ].join('\n');
    const extra = [
      def('ffapis', 'Free FF API list 🌐 (Admin)'),
      def('ffapihealth', 'API status check 🩺 (Admin)'),
      def('esportmenu', 'Esports + FF combined 🏆')
    ].join('\n');

    const text = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   🔥 *FREE FIRE MENU* 🔥
┃   FF Tools • Player Stats
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

▚▚▚▚ 👤 *PLAYER INFO* ▞▞▞▞
${rows}

▚▚▚▚ 📦 *ITEMS & WISHLIST* ▞▞▞▞
${items}

▚▚▚▚ 🔗 *ACCOUNT LINK* ▞▞▞▞
${link}

▚▚▚▚ 🎨 *NAME & IMAGE TOOLS* ▞▞▞▞
${style}

▚▚▚▚ 🎮 *EXTRA / ESPORTS* ▞▞▞▞
${extra}

──────────────────────────────
💡 *Tip:* Kisi bhi player ka rank,
guild ya ban status check karo
sirf UID se!

📢 *Channel:* ABIX-AE
————————————————
✨ *Powered by ${ABIX}*`;

    try {
      const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
      const options = fs.existsSync(imagePath)
        ? { image: fs.readFileSync(imagePath), caption: text, contextInfo: {} }
        : { text, contextInfo: {} };
      return sock.sendMessage(chatId, options, { quoted: message });
    } catch (error) {
      console.error('FF Menu Error:', error);
      return sock.sendMessage(chatId, { text, contextInfo: {} }, { quoted: message });
    }
  }
};