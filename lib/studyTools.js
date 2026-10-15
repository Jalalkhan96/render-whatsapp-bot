const axios = require('axios');

const FAKE_FORWARD = require('./channelInfo').getChannelInfo({ newsletterName: 'ABIX-AE' });
const aiEndpoints = [
  text => `https://vapis.my.id/api/gemini?q=${encodeURIComponent(text)}`,
  text => `https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(text)}`,
  text => `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(text)}`,
  text => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(text)}`
];

async function askAI(prompt) {
  let lastError;
  for (const makeUrl of aiEndpoints) {
    try {
      const { data } = await axios.get(makeUrl(prompt), { timeout: 20000 });
      const answer = data?.message || data?.data || data?.answer || data?.result;
      if (typeof answer === 'string' && answer.trim()) return answer.trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message || 'Study AI providers unavailable');
}

function inputText(message, args) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
  return args.join(' ').trim() || quotedText.trim();
}

function wrap(title, body) {
  return `🎓 *${title}*\n\n${body}\n\n⚠️ Educational help only — official syllabus/citation assume nahi ki gayi.`;
}

function parseNumbers(value) {
  return String(value).split(',').map(x => Number(x.trim())).filter(Number.isFinite);
}

function statistics(args) {
  const op = String(args.shift() || 'mean').toLowerCase();
  const values = parseNumbers(args.join(' '));
  if (!values.length) throw new Error('Comma-separated numbers do, e.g. 10,20,30');
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (op === 'mean' || op === 'average') return `Mean: ${mean}`;
  if (op === 'median') return `Median: ${sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2}`;
  if (op === 'mode') { const counts = new Map(values.map(v => [v, 0])); values.forEach(v => counts.set(v, counts.get(v) + 1)); const max = Math.max(...counts.values()); return `Mode: ${[...counts].filter(([, count]) => count === max).map(([v]) => v).join(', ')}`; }
  if (op === 'range') return `Range: ${sorted.at(-1) - sorted[0]}`;
  if (op === 'variance' || op === 'stddev' || op === 'standarddeviation') { const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length; return `${op}: ${op === 'variance' ? variance : Math.sqrt(variance)}`; }
  throw new Error('Supported: mean, median, mode, range, variance, stddev');
}

function grade(mark, scale = 4) {
  const percentage = Number(mark);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error('Marks 0 se 100 ke darmiyan do');
  const letter = percentage >= 85 ? 'A' : percentage >= 80 ? 'A-' : percentage >= 75 ? 'B+' : percentage >= 70 ? 'B' : percentage >= 65 ? 'B-' : percentage >= 60 ? 'C+' : percentage >= 50 ? 'C' : percentage >= 40 ? 'D' : 'F';
  const points4 = percentage >= 85 ? 4 : percentage >= 80 ? 3.7 : percentage >= 75 ? 3.3 : percentage >= 70 ? 3 : percentage >= 65 ? 2.7 : percentage >= 60 ? 2.3 : percentage >= 50 ? 2 : percentage >= 40 ? 1 : 0;
  return `Marks: ${percentage}%\nGrade: ${letter}\nApprox points (${scale}-scale): ${(points4 / 4 * scale).toFixed(2)}\n\n⚠️ Grade scale institution ke mutabiq change ho sakti hai.`;
}

module.exports = { FAKE_FORWARD, askAI, inputText, wrap, statistics, grade };
