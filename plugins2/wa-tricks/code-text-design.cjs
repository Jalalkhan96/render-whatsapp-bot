'use strict';

const { sendCodeBlock: sendNativeCodeBlock } = require('../../lib/richCodeBridge.cjs');

const STYLES = {
  mac: { top: (f, l) => `🔴🟡🟢  *${f || ''}*`.trim(), sub: l => `💻 ${l}`, div: '━━━━━━━━━━━━━━━━' },
  terminal: { top: (f) => `┌─ 💻 *${f || ''}*`.trim(), sub: l => `└─ 📦 ${l}`, div: '────────────────' },
  minimal: { top: (f) => `📄 *${f || ''}*`.trim(), sub: l => `🏷️ ${l}`, div: '────────────────' },
  neon: { top: (f) => `⚡ *${f || ''}* ⚡`.trim(), sub: l => `✦ ${l} ✦`, div: '✦ ──────────── ✦' },
};
const styleNames = () => Object.keys(STYLES);

function boxLines(code) {
  const lines = String(code || '').trim().split('\n');
  const width = Math.max(1, Math.min(90, ...lines.map(line => line.length)));
  const top = '┌' + '─'.repeat(width + 2) + '┐';
  const bottom = '└' + '─'.repeat(width + 2) + '┘';
  return `${top}\n${lines.map(line => '│ ' + line.slice(0, width).padEnd(width, ' ') + ' │').join('\n')}\n${bottom}`;
}

function codeMessage(options = {}) {
  const {
    intro = '', filename = '', language = 'JavaScript', code = '', details = '', style = 'mac', box = false,
  } = options;
  const s = STYLES[style] || STYLES.mac;
  const sections = [];
  if (intro) sections.push(String(intro));
  if (filename) sections.push(`${s.top(filename, language)}\n${s.sub(language)}\n${s.div}`);
  sections.push(`\`\`\`${String(language || 'javascript').toLowerCase()}\n${box ? boxLines(code) : String(code).trim()}\n\`\`\``);
  if (details) sections.push(`${s.div}\n\n📝 *Detail:*\n${details}`);
  return sections.join('\n\n');
}

async function sendCodeMessage(sock, from, options = {}, quotedMsg = null) {
  return sendNativeCodeBlock(sock, from, {
    code: options.code,
    language: options.language || 'javascript',
    // These map to the native rich response header/body/footer.
    text: options.intro || '',
    title: options.nativeTitle || '',
    footer: options.details || '',
  }, quotedMsg ? { quoted: quotedMsg } : {});
}

module.exports = { STYLES, styleNames, codeMessage, sendCodeMessage, boxLines };
