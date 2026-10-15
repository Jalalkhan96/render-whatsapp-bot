'use strict';

const owner = require('./owner');

async function isOwnerAsync(senderId, sock, chatId) {
  return (await owner.resolveOwner(senderId, sock, chatId)).isOwner;
}

async function isPrimaryOwnerAsync(senderId, sock, chatId) {
  return (await owner.resolveOwner(senderId, sock, chatId)).isPrimaryOwner;
}

async function getCleanName(jid) {
  return owner.normalizeIdentity(jid) || 'Unknown';
}

module.exports = isOwnerAsync;
module.exports.isOwner = owner.isOwner;
module.exports.isOwnerAsync = isOwnerAsync;
module.exports.isOwnerOnly = owner.isPrimaryOwner;
module.exports.isOwnerOnlyAsync = isPrimaryOwnerAsync;
module.exports.isPrimaryOwner = owner.isPrimaryOwner;
module.exports.isSecondaryOwner = owner.isSecondaryOwner;
module.exports.ownerNumbers = owner.ownerNumbers;
module.exports.cleanJid = owner.normalizeIdentity;
module.exports.getCleanName = getCleanName;
module.exports.ownerMatches = owner.isOwner;
