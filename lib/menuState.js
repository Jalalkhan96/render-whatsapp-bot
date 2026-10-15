const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'data', 'menu-state.json');
let states = { global: {}, chats: {} };

try {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  states = parsed && typeof parsed === 'object' && parsed.global && parsed.chats
    ? parsed
    : { global: parsed && typeof parsed === 'object' ? parsed : {}, chats: {} };
} catch {
  states = { global: {}, chats: {} };
}

function isMenuEnabled(menuName, chatId = null) {
  const key = String(menuName).toLowerCase();
  const chat = chatId ? states.chats[String(chatId)] : null;
  if (chat && Object.prototype.hasOwnProperty.call(chat, key)) return chat[key] !== false;
  return states.global[key] !== false;
}

function setMenuEnabled(menuName, enabled, chatId = null) {
  const key = String(menuName).toLowerCase();
  if (chatId) {
    const chat = String(chatId);
    states.chats[chat] = { ...(states.chats[chat] || {}), [key]: Boolean(enabled) };
  } else {
    states.global[key] = Boolean(enabled);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(states, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  return chatId ? states.chats[String(chatId)][key] : states.global[key];
}

module.exports = { file, isMenuEnabled, setMenuEnabled };
