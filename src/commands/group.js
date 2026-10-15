import { childLogger } from '../utils/logger.js';
import { isGroupJid } from '../whatsapp/messages.js';

const log = childLogger('group-commands');

function targetFromMessage(msg, arg = '') {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo || {};
  const mentioned = ctx.mentionedJid || [];
  if (mentioned[0]) return mentioned[0];
  if (ctx.participant) return ctx.participant;
  const digits = String(arg).replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
}

async function requireGroup(sock, jid) {
  if (!isGroupJid(jid)) throw new Error('This command can only be used in a group.');
  return sock.groupMetadata(jid);
}

export async function handleStaff({ sock, jid }) {
  try {
    const meta = await requireGroup(sock, jid);
    const admins = meta.participants.filter((p) => p.admin);
    return `👑 *GROUP STAFF*\n\n${admins.map((p, i) => `${i + 1}. @${String(p.id).split('@')[0]}`).join('\n')}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleLink({ sock, jid }) {
  try {
    await requireGroup(sock, jid);
    const code = await sock.groupInviteCode(jid);
    return `🔗 *GROUP INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}`;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleMemberAction({ sock, jid, msg, arg, action }) {
  try {
    await requireGroup(sock, jid);
    const target = targetFromMessage(msg, arg);
    if (!target) return `⚠️ Reply to or mention a member. Usage: $${action} @user`;
    await sock.groupParticipantsUpdate(jid, [target], action === 'add' ? 'add' : action);
    return `✅ ${action} completed for @${target.split('@')[0]}`;
  } catch (err) {
    log.warn({ action, err: err.message }, 'Group action failed');
    return `❌ ${err.message}`;
  }
}

export async function handleRename({ sock, jid, arg }) {
  try {
    await requireGroup(sock, jid);
    if (!arg) return '⚠️ Usage: $setgname <new name>';
    await sock.groupUpdateSubject(jid, arg.slice(0, 100));
    return '✅ Group name updated.';
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleDescription({ sock, jid, arg }) {
  try {
    await requireGroup(sock, jid);
    if (!arg) return '⚠️ Usage: $setgdesc <new description>';
    await sock.groupUpdateDescription(jid, arg.slice(0, 2048));
    return '✅ Group description updated.';
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleMute({ sock, jid }) {
  try {
    await requireGroup(sock, jid);
    await sock.groupSettingUpdate(jid, 'announcement');
    return '🔇 Group muted: only admins can send messages.';
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleLeave({ sock, jid }) {
  try {
    await requireGroup(sock, jid);
    await sock.sendMessage(jid, { text: '👋 *ABIX* is leaving this group. Goodbye!' });
    await sock.groupLeave(jid);
    return null;
  } catch (err) {
    return `❌ Unable to leave group: ${err.message}`;
  }
}

export async function handleTag({ sock, jid, msg, arg, all = false, nonAdmins = false }) {
  try {
    const meta = await requireGroup(sock, jid);
    const candidates = meta.participants || [];
    const filtered = candidates.filter((p) => !nonAdmins || !p.admin);
    const ids = all ? filtered.map((p) => p.id) : [targetFromMessage(msg, arg)].filter(Boolean);
    if (!ids.length) return '⚠️ Reply to or mention a member, or use $tagall.';
    const text = all
      ? (nonAdmins ? '👥 @everyone except admins' : '👥 @everyone')
      : `👤 @${ids[0].split('@')[0]}`;
    await sock.sendMessage(jid, { text, mentions: ids }, { quoted: msg });
    return null;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handleHidetag({ sock, jid, msg, arg }) {
  try {
    const meta = await requireGroup(sock, jid);
    const ids = meta.participants.map((p) => p.id);
    const text = arg || '👥';
    await sock.sendMessage(jid, { text, mentions: ids }, { quoted: msg });
    return null;
  } catch (err) {
    return `❌ ${err.message}`;
  }
}

export async function handlePoll({ sock, jid, msg, arg }) {
  if (!isGroupJid(jid)) return '⚠️ Polls can only be created in groups.';
  const parts = String(arg || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return '⚠️ Usage: $poll Question | Option 1 | Option 2 | Option 3';
  const question = parts.shift();
  if (parts.length > 12) return '⚠️ Maximum 12 options.';
  await sock.sendMessage(jid, {
    poll: {
      name: question,
      values: parts,
      selectableCount: 1,
    },
  }, { quoted: msg });
  return null;
}

export async function handleDelete({ sock, jid, msg }) {
  try {
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const participant = msg?.message?.extendedTextMessage?.contextInfo?.participant;
    if (!quoted) return '⚠️ Reply to the message you want to delete with $delete.';
    const key = {
      remoteJid: jid,
      fromMe: false,
      id: quoted,
      participant,
    };
    await sock.sendMessage(jid, { delete: key });
    return null;
  } catch (err) {
    return `❌ Delete failed: ${err.message}`;
  }
}

export async function handleUnmute({ sock, jid }) {
  try {
    await requireGroup(sock, jid);
    await sock.groupSettingUpdate(jid, 'not_announcement');
    return '🔊 Group unmuted: members can send messages.';
  } catch (err) {
    return `❌ ${err.message}`;
  }
}
