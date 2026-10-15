'use strict';
const assert = require('assert');
const { normalizeIdentity, isPrimaryOwner, isSecondaryOwner, isOwner } = require('../lib/owner');

assert.strictEqual(normalizeIdentity('+92 330 9330283'), '923309330283');
assert.strictEqual(normalizeIdentity('03309330283@s.whatsapp.net'), '923309330283');
assert.strictEqual(isPrimaryOwner(process.env.OWNER_NUMBER || '00000000000'), Boolean(process.env.OWNER_NUMBER));
assert.strictEqual(isOwner(process.env.OWNER_NUMBER || '00000000000'), Boolean(process.env.OWNER_NUMBER));
console.log('[PASS] owner identity normalization/authorization helpers');
