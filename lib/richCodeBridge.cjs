'use strict';

/**
 * ABIX native rich-code bridge.
 *
 * Preferred path (enhanced Baileys fork):
 *   sock.sendCodeBlockV2(...)
 *   sock.sendCodeBlock(...)
 *   sock.sendMessage(..., { richResponse: [...] })
 *
 * Fallback path: ordinary fenced markdown text.
 */

function cleanLanguage(value = 'javascript') {
  const s = String(value || 'javascript').trim().toLowerCase();
  const aliases = {
    js: 'javascript', javascript: 'javascript', node: 'javascript', nodejs: 'javascript',
    ts: 'typescript', typescript: 'typescript',
    py: 'python', python: 'python',
    sh: 'bash', shell: 'bash', bash: 'bash', zsh: 'bash',
    yml: 'yaml', yaml: 'yaml',
    html: 'html', htm: 'html',
    css: 'css',
    c: 'c', 'c++': 'c++', cpp: 'c++',
    'c#': 'c#', cs: 'c#', csharp: 'c#',
    java: 'java',
    go: 'go', golang: 'go',
    rust: 'rust', rs: 'rust',
    php: 'php',
    sql: 'sql',
    json: 'json',
    xml: 'xml',
    lua: 'lua',
    powershell: 'powershell', ps: 'powershell', ps1: 'powershell',
    markdown: 'markdown', md: 'markdown',
  };
  return aliases[s] || s || 'javascript';
}

function fenced(code, language) {
  const lang = cleanLanguage(language);
  let body = String(code ?? '').replace(/\r\n?/g, '\n').trim();
  // Avoid accidentally terminating our own fence when the payload itself contains ```.
  const fence = body.includes('```') ? '````' : '```';
  return `${fence}${lang}\n${body}\n${fence}`;
}

function splitFencedBlocks(text) {
  const input = String(text || '').replace(/\r\n?/g, '\n');
  const re = /```([\w#+.-]*)\n?([\s\S]*?)```/g;
  const blocks = [];
  let last = 0;
  let match;
  while ((match = re.exec(input))) {
    if (match.index > last) blocks.push({ type: 'text', text: input.slice(last, match.index) });
    blocks.push({ type: 'code', language: cleanLanguage(match[1] || 'javascript'), code: match[2].trim() });
    last = re.lastIndex;
  }
  if (last < input.length) blocks.push({ type: 'text', text: input.slice(last) });
  return blocks;
}

function extractSingleCode(text) {
  const parts = splitFencedBlocks(text);
  const codeParts = parts.filter(p => p.type === 'code');
  if (codeParts.length !== 1) return null;
  const firstCode = parts.findIndex(p => p.type === 'code');
  const before = parts.slice(0, firstCode).filter(p => p.type === 'text').map(p => p.text).join('').trim();
  const after = parts.slice(firstCode + 1).filter(p => p.type === 'text').map(p => p.text).join('').trim();
  return { ...codeParts[0], intro: before, details: after };
}

function nativeOptions(options = {}) {
  return {
    language: cleanLanguage(options.language),
    ...(options.title ? { title: String(options.title) } : {}),
    ...(options.text ? { text: String(options.text) } : {}),
    ...(options.footer ? { footer: String(options.footer) } : {}),
  };
}

async function tryNativeCode(sock, jid, code, options = {}, sendOptions = {}) {
  const opts = nativeOptions(options);

  if (typeof sock?.sendCodeBlockV2 === 'function') {
    return sock.sendCodeBlockV2(jid, code, sendOptions?.quoted || null, opts);
  }

  if (typeof sock?.sendCodeBlock === 'function') {
    return sock.sendCodeBlock(jid, code, sendOptions?.quoted || null, opts);
  }

  if (typeof sock?.sendMessage === 'function') {
    const richResponse = [];
    if (opts.text) richResponse.push({ text: opts.text });
    richResponse.push({ language: opts.language, code: opts.code || code });
    if (opts.footer) richResponse.push({ text: opts.footer });

    // Some enhanced Baileys forks accept richResponse directly in sendMessage.
    // Do not send this shape when a known native helper is absent unless the caller
    // has explicitly enabled it; official Baileys may reject unknown message keys.
    if (process.env.ABIX_ENABLE_RICH_RESPONSE === '1') {
      return sock.sendMessage(jid, { richResponse }, sendOptions);
    }
  }

  return null;
}

async function sendCodeBlock(sock, jid, options = {}, sendOptions = {}) {
  const code = String(options.code ?? '').trim();
  if (!code) throw new Error('Code content is empty.');

  const native = await tryNativeCode(sock, jid, code, options, sendOptions);
  if (native) return native;

  const fallbackText = [
    options.text || '',
    fenced(code, options.language || 'javascript'),
    options.footer || '',
  ].filter(Boolean).join('\n\n');
  return sock.sendMessage(jid, { text: fallbackText }, sendOptions);
}

async function sendRichMarkdown(sock, jid, markdown, sendOptions = {}) {
  const parsed = extractSingleCode(markdown);
  if (!parsed) return sock.sendMessage(jid, { text: String(markdown || '') }, sendOptions);
  return sendCodeBlock(sock, jid, {
    code: parsed.code,
    language: parsed.language,
    text: parsed.intro,
    footer: parsed.details,
  }, sendOptions);
}

module.exports = {
  cleanLanguage,
  fenced,
  splitFencedBlocks,
  extractSingleCode,
  sendCodeBlock,
  sendRichMarkdown,
};
