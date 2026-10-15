'use strict';

const { resolveOwner } = require('./owner');

const Permission = Object.freeze({
  PUBLIC: 'PUBLIC',
  GROUP_ONLY: 'GROUP_ONLY',
  GROUP_ADMIN: 'GROUP_ADMIN',
  BOT_ADMIN: 'BOT_ADMIN',
  OWNER: 'OWNER',
  PRIMARY_OWNER: 'PRIMARY_OWNER',
});

const validPermissions = new Set(Object.values(Permission));

function enabled(value) {
  return value === true || value === 1 ||
    (typeof value === 'string' && ['true', '1', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase()));
}

function getPermission(command) {
  const explicit = String(command?.permission || '').toUpperCase();
  if (validPermissions.has(explicit)) return explicit;
  if (enabled(command?.strictOwnerOnly)) return Permission.PRIMARY_OWNER;
  if (enabled(command?.ownerOnly) || String(command?.category || '').toLowerCase() === 'owner') return Permission.OWNER;
  if (enabled(command?.adminOnly)) return Permission.GROUP_ADMIN;
  if (enabled(command?.botAdmin)) return Permission.BOT_ADMIN;
  if (enabled(command?.groupOnly)) return Permission.GROUP_ONLY;
  return Permission.PUBLIC;
}

function needsAdminMetadata(command) {
  const permission = getPermission(command);
  return permission === Permission.GROUP_ADMIN || permission === Permission.BOT_ADMIN ||
    enabled(command?.adminOnly) || enabled(command?.botAdmin);
}

async function buildPermissionContext({ sock, message, chatId, senderId, isGroup, isSenderAdmin = false, isBotAdmin = false }) {
  const owner = await resolveOwner(senderId, sock, chatId);

  return {
    chatId,
    senderId,
    isGroup: Boolean(isGroup),
    isSenderAdmin: Boolean(isSenderAdmin),
    isBotAdmin: Boolean(isBotAdmin),
    ...owner,
  };
}

function checkPermission(command, context) {
  const permission = getPermission(command);
  const groupRequired = permission === Permission.GROUP_ONLY || permission === Permission.GROUP_ADMIN || permission === Permission.BOT_ADMIN;

  if (groupRequired && !context.isGroup) {
    return { allowed: false, permission, reason: 'This command can only be used in a group.' };
  }

  if (permission === Permission.PRIMARY_OWNER && !context.isPrimaryOwner) {
    return { allowed: false, permission, reason: 'This command is restricted to the primary owner.' };
  }

  if (permission === Permission.OWNER && !context.isOwner) {
    return { allowed: false, permission, reason: 'This command is restricted to configured owners.' };
  }

  if (permission === Permission.GROUP_ADMIN && !context.isOwner && !context.isSenderAdmin) {
    return { allowed: false, permission, reason: 'This command requires a group admin.' };
  }

  if ((permission === Permission.BOT_ADMIN || enabled(command?.adminOnly) || enabled(command?.botAdmin)) && !context.isBotAdmin) {
    return { allowed: false, permission, reason: 'Make the bot a group admin and try again.' };
  }

  return { allowed: true, permission, reason: null };
}

module.exports = { Permission, getPermission, needsAdminMetadata, buildPermissionContext, checkPermission };
