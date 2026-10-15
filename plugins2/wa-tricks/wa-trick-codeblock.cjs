/**
 * MYBOT WhatsApp native-style code block helper.
 *
 * WhatsApp renders Markdown fenced code blocks as its native code card
 * (dark/black code surface, monospace text, copy button and, for long code,
 * a "View code" expansion). The client controls the final visual layout.
 */
'use strict';

const LANGUAGE_ALIASES = new Map([
  ['js', 'javascript'], ['mjs', 'javascript'], ['cjs', 'javascript'],
  ['ts', 'typescript'], ['tsx', 'typescript'], ['jsx', 'javascript'],
  ['py', 'python'], ['rb', 'ruby'], ['sh', 'bash'], ['shell', 'bash'],
  ['ps', 'powershell'], ['ps1', 'powershell'], ['yml', 'yaml'], ['md', 'markdown'],
  ['c++', 'cpp'], ['c#', 'csharp'], ['cs', 'csharp'], ['postgres', 'postgresql'],
]);

function normalizeLanguage(value = '') {
  const raw = String(value).trim().toLowerCase().replace(/[^a-z0-9+#_-]/g, '');
  return LANGUAGE_ALIASES.get(raw) || raw || 'text';
}

function sanitizeCode(code) {
  return String(code ?? '').replace(/\r\n?/g, '\n').replace(/```/g, '`\u200b``');
}

function codeBlock(code, language = 'text') {
  const lang = normalizeLanguage(language);
  return `\`\`\`${lang === 'text' ? '' : lang}\n${sanitizeCode(code)}\n\`\`\``;
}

async function sendCodeBlock(sock, from, code, opts = {}, quotedMsg = null) {
  const text = codeBlock(code, opts.language || 'text');
  const options = quotedMsg && opts.quote !== false ? { quoted: quotedMsg } : {};
  // Prevent the project's synthetic newsletter/forward context from being
  // attached to the code message. This keeps the native code card clean.
  return sock.sendMessage(from, { text, _skipForwardContext: true }, options);
}

async function sendCodeBlocks(sock, from, blocks = [], opts = {}, quotedMsg = null) {
  const parts = Array.isArray(blocks) ? blocks : [];
  const text = parts.map((entry) => {
    if (typeof entry === 'string') return codeBlock(entry, 'text');
    return codeBlock(entry?.code || '', entry?.language || 'text');
  }).join('\n\n');
  const options = quotedMsg && opts.quote !== false ? { quoted: quotedMsg } : {};
  return sock.sendMessage(from, { text, _skipForwardContext: true }, options);
}

module.exports = { codeBlock, sendCodeBlock, sendCodeBlocks, normalizeLanguage, sanitizeCode };

if (require.main === module) {
  const sample = codeBlock(
    'const name = "Jalal";\nconsole.log(name);',
    'javascript'
  );
  const long = codeBlock(
    Array.from({ length: 35 }, (_, i) => `console.log("line ${i + 1}");`).join('\n'),
    'javascript'
  );
  console.log('✅ language fence:', sample.startsWith('```javascript\n'));
  console.log('✅ clean closing fence:', sample.endsWith('\n```'));
  console.log('✅ long code lines:', long.split('\n').length);
  console.log('✅ inner fence escaped:', codeBlock('a ``` b', 'javascript').includes('`\u200b``'));
}
