/**
 * MYBOT Native WhatsApp Code Blocks
 *
 * Turns fenced Markdown code blocks into WhatsApp's AI Rich Response format
 * when the active Baileys fork exposes the required rich-message support.
 *
 * Native path (preferred):
 *   sock.sendCodeBlock(...)                     // @nuiisweety/baileys
 *   or sock.sendMessage(..., { richResponse })
 *
 * Safe fallback:
 *   normal triple-backtick text, so older clients/installations still receive
 *   the code rather than an image or a broken message.
 */

const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  golang: 'go',
  c: 'c',
  'c++': 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  ps: 'powershell',
  ps1: 'powershell',
  md: 'markdown',
  yml: 'yaml',
  mysql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
  text: 'plaintext',
  txt: 'plaintext',
};

function normalizeLanguage(language = 'javascript') {
  const raw = String(language || 'javascript').trim().toLowerCase();
  return LANGUAGE_ALIASES[raw] || raw || 'javascript';
}

function parseFencedCode(text) {
  const source = String(text ?? '');
  const parts = [];
  const re = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(source))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: source.slice(lastIndex, match.index) });
    }

    let language = String(match[1] || '').trim();
    // Markdown commonly has ```javascript. Keep the first token only if the
    // fence accidentally contains extra spaces or metadata.
    if (/\s/.test(language)) language = language.split(/\s+/)[0];

    let code = match[2] || '';
    if (code.endsWith('\r\n')) code = code.slice(0, -2);
    else if (code.endsWith('\n')) code = code.slice(0, -1);

    parts.push({
      type: 'code',
      language: normalizeLanguage(language || 'javascript'),
      code,
    });

    lastIndex = re.lastIndex;
  }

  if (!parts.length) return null;
  if (lastIndex < source.length) {
    parts.push({ type: 'text', text: source.slice(lastIndex) });
  }

  // Remove empty plain-text edges, but preserve meaningful newlines between
  // multiple blocks so the rich renderer keeps the intended structure.
  while (parts[0]?.type === 'text' && !parts[0].text.trim()) parts.shift();
  while (parts[parts.length - 1]?.type === 'text' && !parts[parts.length - 1].text.trim()) parts.pop();
  return parts.length ? parts : null;
}

function containsFencedCode(text) {
  return /```[^\r\n`]*\r?\n[\s\S]*?```/.test(String(text ?? ''));
}

function fencedFallback(parts) {
  return parts.map((part) => {
    if (part.type === 'code') {
      const lang = part.language && part.language !== 'plaintext' ? part.language : '';
      return `\`\`\`${lang}\n${part.code}\n\`\`\``;
    }
    return part.text;
  }).join('');
}

function flattenTextParts(parts) {
  return parts.map((part) => part.type === 'text' ? part.text : '').join('');
}


function hasNativeRichSupport(sock) {
  return !!(
    typeof sock?.sendCodeBlock === 'function' ||
    typeof sock?.sendCodeBlockV2 === 'function' ||
    typeof sock?.sendRichMessage === 'function' ||
    typeof sock?.sendUnifiedResponse === 'function' ||
    sock?.__nativeRichResponse === true
  );
}

function richItemFromPart(part) {
  if (part.type === 'code') {
    return {
      code: part.code,
      language: normalizeLanguage(part.language),
    };
  }
  return { text: part.text };
}

async function sendNativeCodeMessage(sock, jid, code, options = {}) {
  const language = normalizeLanguage(options.language || 'javascript');
  const quoted = options.quoted || null;

  // Preferred helper shipped by the CommonJS-compatible rich-response fork.
  if (typeof sock?.sendCodeBlock === 'function') {
    try {
      return await sock.sendCodeBlock(
        jid,
        String(code ?? ''),
        quoted,
        {
          language,
          title: options.title || options.headerText,
          text: options.text || options.contentText,
          footer: options.footer || options.footerText,
          disclaimerText: options.disclaimerText,
        }
      );
    } catch (error) {
      // Fall through to the generic richResponse route; this gives us a second
      // native path for fork/version differences.
      if (options.debug) {
        console.warn('[NATIVE-CODE] sendCodeBlock failed:', error.message);
      }
    }
  }

  if (hasNativeRichSupport(sock) && typeof sock?.sendMessage === 'function') {
    try {
      const content = {
        code: String(code ?? ''),
        language,
      };
      if (options.headerText || options.title) content.headerText = options.headerText || options.title;
      if (options.contentText || options.text) content.contentText = options.contentText || options.text;
      if (options.footerText || options.footer) content.footerText = options.footerText || options.footer;
      if (options.disclaimerText) content.disclaimerText = options.disclaimerText;
      if (options._skipChannelForward) content._skipChannelForward = true;
      return await sock.sendMessage(jid, content, quoted ? { quoted } : undefined);
    } catch (error) {
      if (options.debug) {
        console.warn('[NATIVE-CODE] rich code send failed:', error.message);
      }
    }
  }

  return null;
}

/**
 * Send text containing one or more fenced blocks as a single Rich Response
 * where supported. Returns {handled, result, native}.
 */
async function sendCodeAwareMessage(sock, jid, text, options = {}) {
  const parts = Array.isArray(options.parts) ? options.parts : parseFencedCode(text);
  if (!parts) return { handled: false, native: false, result: null };

  const quoted = options.quoted || null;
  const codeParts = parts.filter((part) => part.type === 'code');

  // One pure code block: use the purpose-built helper when available.
  if (codeParts.length === 1 && parts.length === 1) {
    const result = await sendNativeCodeMessage(sock, jid, codeParts[0].code, {
      ...options,
      language: codeParts[0].language,
      quoted,
      _skipChannelForward: true,
    });
    if (result) return { handled: true, native: true, result };
  }

  // One message with multiple text/code sections. @nuiisweety/baileys and
  // other compatible forks expose the richResponse array trigger.
  if (hasNativeRichSupport(sock) && typeof sock?.sendMessage === 'function' && codeParts.length) {
    try {
      const richResponse = parts.map(richItemFromPart);
      const content = {
        richResponse,
        _skipChannelForward: true,
      };
      if (options.headerText) content.headerText = options.headerText;
      if (options.footerText) content.footerText = options.footerText;
      if (options.disclaimerText) content.disclaimerText = options.disclaimerText;
      const result = await sock.sendMessage(jid, content, quoted ? { quoted } : undefined);
      return { handled: true, native: true, result };
    } catch (error) {
      if (options.debug) console.warn('[NATIVE-CODE] richResponse array failed:', error.message);
    }
  }

  return { handled: false, native: false, result: null };
}

async function sendCodeOrFallback(sock, jid, code, options = {}) {
  const result = await sendNativeCodeMessage(sock, jid, code, options);
  if (result) return { native: true, result };

  const lang = normalizeLanguage(options.language || 'javascript');
  const fallback = `\`\`\`${lang}\n${String(code ?? '')}\n\`\`\``;
  const result2 = await sock.sendMessage(
    jid,
    { text: fallback, _skipCodeBlockAutoFormat: true },
    options.quoted ? { quoted: options.quoted } : undefined
  );
  return { native: false, result: result2 };
}

function extractMessageText(message) {
  const m = message?.message || message || {};
  return String(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

module.exports = {
  LANGUAGE_ALIASES,
  normalizeLanguage,
  parseFencedCode,
  containsFencedCode,
  fencedFallback,
  flattenTextParts,
  sendNativeCodeMessage,
  sendCodeAwareMessage,
  sendCodeOrFallback,
  extractMessageText,
  hasNativeRichSupport,
};
