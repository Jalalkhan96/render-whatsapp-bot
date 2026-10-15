import { config } from '../config.js';
import {
  addGroup,
  removeGroup,
  listApprovedGroups,
} from '../database/repositories/groupRepository.js';
import { setSetting, getSetting } from '../database/repositories/settingsRepository.js';
import { clearPromptCache } from '../ai/prompt.js';
import { checkDatabaseConnection } from '../database/database.js';
import { getConnectionStatus } from '../whatsapp/connection.js';
import { getQueueStats } from '../queue/messageQueue.js';
import { setBlocked, getUserByJid } from '../database/repositories/userRepository.js';
import { normalizeJid } from '../config.js';

export function isAdmin(jid) {
  const normalized = jid?.includes('@') ? jid : normalizeJid(jid);
  return config.admin.jids.includes(normalized) || config.admin.numbers.includes(String(jid || '').replace(/\D/g, ''));
}

export async function handleAdminHelp() {
  return `*Admin Commands*

/admin — Show this menu
/groups — List approved groups
/addgroup — Approve the current group (use inside a group)
/removegroup — Remove current group approval (use inside a group)
/broadcast <text> — Send a message to all approved groups
/settings — Show current runtime settings
/setmodel <model> — Change the Gemini model
/setprompt <text> — Change the system prompt
/block <number> — Block a user
/unblock <number> — Unblock a user
/aistatus — Full diagnostic status
/health — Full diagnostic status (alias)
/setmenumedia — Attach/reply with an image, video, or gif to set the /menu header (add "clear" to remove it)`;
}

export async function handleGroups() {
  const groups = await listApprovedGroups();
  if (groups.length === 0) return 'No approved groups yet.';
  return `*Approved Groups*\n${groups.map((g) => `• ${g.name || g.jid}`).join('\n')}`;
}

export async function handleAddGroup(jid, name) {
  if (!jid.endsWith('@g.us')) return '⚠️ This command must be used inside a group.';
  await addGroup(jid, name);
  return '✅ This group has been approved for bot usage.';
}

export async function handleRemoveGroup(jid) {
  if (!jid.endsWith('@g.us')) return '⚠️ This command must be used inside a group.';
  await removeGroup(jid);
  return '✅ This group has been removed from approved usage.';
}

export async function handleBroadcast(sock, text) {
  const groups = await listApprovedGroups();
  let sent = 0;
  for (const group of groups) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sock.sendMessage(group.jid, { text: `📢 *Announcement*\n\n${text}` });
      sent += 1;
    } catch {
      // continue broadcasting even if one group fails
    }
  }
  return `✅ Broadcast sent to ${sent}/${groups.length} group(s).`;
}

export async function handleSettings() {
  const model = await getSetting('override_model', config.gemini.model);
  const groupMode = config.groups.mode;
  return `*Current Settings*
Model: ${model}
Group mode: ${groupMode}
Max history: ${config.memory.maxHistory}
Max daily requests: ${config.limits.maxDailyRequests}
Max concurrent requests: ${config.limits.maxConcurrentRequests}`;
}

export async function handleSetModel(newModel) {
  if (!newModel) return '⚠️ Usage: /setmodel <model-name>';
  await setSetting('override_model', newModel);
  return `✅ Model preference saved: ${newModel}\n(Runtime model override is stored in PostgreSQL settings.)`;
}

export async function handleSetPrompt(newPrompt) {
  if (!newPrompt) return '⚠️ Usage: /setprompt <new system prompt text>';
  await setSetting('system_prompt', newPrompt);
  clearPromptCache();
  return '✅ System prompt updated.';
}

export async function handleBlock(numberArg) {
  if (!numberArg) return '⚠️ Usage: /block <number>';
  const jid = normalizeJid(numberArg);
  await setBlocked(jid, true);
  return `✅ Blocked ${numberArg}.`;
}

export async function handleUnblock(numberArg) {
  if (!numberArg) return '⚠️ Usage: /unblock <number>';
  const jid = normalizeJid(numberArg);
  await setBlocked(jid, false);
  return `✅ Unblocked ${numberArg}.`;
}

export async function handleAiStatus() {
  const dbOk = await checkDatabaseConnection();
  const wa = getConnectionStatus();
  const queue = getQueueStats();
  return `*Diagnostic Status*
Database: ${dbOk ? 'connected' : 'ERROR'}
WhatsApp: ${wa}
Active AI requests: ${queue.activeGlobalRequests}
Waiting in global queue: ${queue.waitingForSlot}
Users with pending queue: ${queue.usersWithPendingQueue}
Uptime: ${Math.floor(process.uptime())}s`;
}

export async function isUserBlocked(jid) {
  const user = await getUserByJid(jid);
  return !!user?.is_blocked;
}
