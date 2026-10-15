import { getConnectionStatus } from '../whatsapp/connection.js';
import { childLogger } from '../utils/logger.js';
import { isGroupJid } from '../whatsapp/messages.js';

const log = childLogger('tool-commands');

export function handleUptime() {
  const seconds = Math.floor(process.uptime());
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `⏱️ *Uptime*\n${days}d ${hours}h ${minutes}m ${secs}s\nWhatsApp: ${getConnectionStatus()}`;
}

export function handleId({ jid, msg }) {
  const sender = msg?.key?.participant || msg?.key?.remoteJid || jid;
  const chat = msg?.key?.remoteJid || jid;
  const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  return `*WhatsApp IDs*\nChat JID: ${chat}\nSender JID: ${sender}${mentioned.length ? `\nMentioned: ${mentioned.join(', ')}` : ''}`;
}

export async function handleGroupInfo({ sock, jid }) {
  if (!isGroupJid(jid)) return '⚠️ This command can only be used in a group.';
  try {
    const metadata = await sock.groupMetadata(jid);
    const admins = metadata.participants.filter((p) => p.admin).length;
    return `*Group Info*\nName: ${metadata.subject || 'Unknown'}\nJID: ${metadata.id}\nOwner: ${metadata.owner || 'Unknown'}\nMembers: ${metadata.participants.length}\nAdmins: ${admins}\nDescription: ${metadata.desc || 'None'}`;
  } catch (err) {
    log.warn({ jid, err: err.message }, 'Group info lookup failed');
    return '⚠️ Unable to retrieve group information.';
  }
}
