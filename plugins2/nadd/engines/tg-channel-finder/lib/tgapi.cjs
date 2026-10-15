// Minimal Telegram Bot API wrapper (zero dependencies, long polling).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeApi(token) {
  const base = `https://api.telegram.org/bot${token}`;
  async function call(method, params = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${base}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!data.ok) {
          // Flood control: wait and retry once
          if (data.parameters && data.parameters.retry_after) {
            await sleep(data.parameters.retry_after * 1000);
            continue;
          }
          throw new Error(`Telegram API: ${data.description || 'unknown error'}`);
        }
        return data.result;
      } catch (e) {
        if (i === retries - 1) throw e;
        await sleep(1500 * (i + 1));
      }
    }
  }
  // Split long texts into 4096-char chunks at line boundaries.
  async function sendMessage(chatId, text, extra = {}) {
    const chunks = [];
    let rest = String(text);
    while (rest.length > 4096) {
      let cut = rest.lastIndexOf('\n', 4096);
      if (cut < 500) cut = 4096;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    chunks.push(rest);
    let last = null;
    for (const c of chunks) {
      last = await call('sendMessage', { chat_id: chatId, text: c, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
      if (chunks.length > 1) await sleep(400);
    }
    return last;
  }
  const getUpdates = (offset, timeout) => call('getUpdates', { offset, timeout, allowed_updates: ['message'] });
  return { call, sendMessage, getUpdates };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { makeApi, esc, sleep };
