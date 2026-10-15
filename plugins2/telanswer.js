'use strict';

const {
  refreshQuiz,
  SOURCE_URL,
  API_SOURCE_URL
} = require('../lib/telenorQuiz');

function formatAnswers(data) {
  const lines = data.questions.map(item => {
    const options = item.options?.length
      ? `\n📝 Options: ${item.options.join(' | ')}`
      : '';
    return `*Q${item.number}.* ${item.question}${options}\n✅ *Answer:* ${item.answer}`;
  });

  const updated = data.fetchedAt
    ? new Date(data.fetchedAt).toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'cached';

  return `╭━━━〔 📱 *TELENOR QUIZ* 〕━━━╮
┃ 📅 *${data.date}*
┃ 🕐 Fetched: ${updated} PKT
┃ ⚡ Cache: *1 fetch → all requests*
┃ 🔄 New cache after Karachi midnight
┃
${lines.map(line => `┃ ${line.replace(/\n/g, '\n┃ ')}`).join('\n┃\n')}
┃
╰━━━〔 *Daily Answers* 〕━━━╯`;
}

module.exports = {
  command: 'telanswer',
  aliases: ['telenoranswer', 'telenoranswers'],
  category: 'education',
  description: 'Aaj ke Telenor quiz ke 5 correct answers',
  usage: '.telanswer',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      // Lazy/cache-first behavior:
      // - first request of the day => network fetch + cache
      // - every other request => local cache only
      // - after Asia/Karachi midnight => old cache removed, next request fetches new data
      const result = await refreshQuiz();

      await sock.sendMessage(chatId, {
        text: formatAnswers(result.data)
      }, { quoted: message });
    } catch (error) {
      console.error('[Telenor] .telanswer failed:', error);
      await sock.sendMessage(chatId, {
        text: `❌ *Telenor quiz is not ready yet.*\n\n${error.message}\n\n🕛 The bot uses *Asia/Karachi* date rollover and will retry automatically on the next request.\n\n🔗 Source: ${API_SOURCE_URL || SOURCE_URL}`
      }, { quoted: message });
    }
  }
};
