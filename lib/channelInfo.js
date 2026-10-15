const settings = require('../settings');

function getChannelInfo({
  newsletterJid,
  newsletterName,
  forwardingScore = 1,
  isForwarded = true,
} = {}) {
  const resolvedJid = process.env.NEWSLETTER_JID || settings.newsletterJid || newsletterJid || '120363413637544342@newsletter';
  const resolvedName = process.env.NEWSLETTER_NAME || settings.newsletterName || settings.botName || newsletterName || 'ABIX';

  const contextInfo = {
    forwardingScore,
    isForwarded,
  };

  if (resolvedJid) {
    contextInfo.forwardedNewsletterMessageInfo = {
      newsletterJid: resolvedJid,
      newsletterName: resolvedName,
      serverMessageId: -1,
    };
  }

  return { contextInfo };
}

const PATCHED = Symbol('abix.fakeForward.patched');

function forwardContext() {
  return getChannelInfo().contextInfo;
}

function normalizeForwardContext(content) {
  if (!content || typeof content !== 'object' || !content.contextInfo) return content;

  const channel = getChannelInfo().contextInfo.forwardedNewsletterMessageInfo;
  if (!channel) return content;

  content.contextInfo = {
    ...content.contextInfo,
    forwardedNewsletterMessageInfo: {
      ...content.contextInfo.forwardedNewsletterMessageInfo,
      newsletterJid: channel.newsletterJid,
      newsletterName: channel.newsletterName,
    }
  };
  return content;
}

function patchSock(sock) {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  const current = sock.sendMessage;
  if (current[PATCHED]) return sock;

  const wrapped = async (jid, content, options) => {
    const noForward = Boolean(content && typeof content === 'object' && content._skipForwardContext === true);
    if (noForward) {
      content = { ...content };
      delete content._skipForwardContext;
    }
    if (content && typeof content === 'object' && !content.contextInfo && !noForward) {
      const skipKeys = ['react', 'delete', 'update', 'pollUpdate', 'viewOnce', 'list', 'button', '_skipMenuCard'];
      const isSpecial = skipKeys.some(k => k in content);
      if (!isSpecial && !(typeof content.text === 'string' && content.text.trim() === '')) {
        content.contextInfo = forwardContext();
      }
    }
    try {
      return await current.call(sock, jid, noForward ? content : normalizeForwardContext(content), options);
    } catch (error) {
      const message = String(error?.message || '');
      const shouldRetryWithoutQuote =
        options?.quoted &&
        (/rate-overlimit/i.test(message) || /groupmetadata/i.test(message));
      if (!shouldRetryWithoutQuote) throw error;

      const retryOptions = { ...(options || {}) };
      delete retryOptions.quoted;
      return current.call(sock, jid, normalizeForwardContext(content), retryOptions);
    }
  };
  Object.defineProperty(wrapped, PATCHED, { value: true });
  sock.sendMessage = wrapped;
  return sock;
}

module.exports = { getChannelInfo, forwardContext, patchSock, normalizeForwardContext };