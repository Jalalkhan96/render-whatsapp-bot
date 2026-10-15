'use strict';
const path = require('path');
const registry = require(path.join(__dirname, '..', 'plugins2', 'nadd', 'nadd-registry.cjs'));
const commandNames = new Set();
const aliasNames = new Set();
const errors = [];
for (const p of registry) {
  if (!p?.command || typeof p.handler !== 'function') errors.push(`invalid plugin: ${p?.command || '(missing)'}`);
  const c = String(p.command || '').toLowerCase();
  if (commandNames.has(c)) errors.push(`duplicate command: ${c}`);
  commandNames.add(c);
  if (String(p.command || '').toLowerCase().startsWith('nadd') === false) errors.push(`non-nadd command: ${p.command}`);
  if (p.permission !== 'OWNER' || p.ownerOnly !== true || p.strictOwnerOnly !== false) errors.push(`bad owner policy: ${p.command}`);
  for (const a of (p.aliases || [])) {
    const x = String(a).toLowerCase();
    if (commandNames.has(x)) errors.push(`alias collides with command: ${x}`);
    if (aliasNames.has(x)) errors.push(`duplicate alias: ${x}`);
    aliasNames.add(x);
  }
}
const menu = registry.find((p) => p.command === 'naddmenu');
const sent = [];
const sock = { sendMessage: async (_jid, payload) => { sent.push(payload?.text || ''); return {}; } };
(async () => {
  await menu.handler(sock, { key: { remoteJid: 'verify@s.whatsapp.net' } });
  const text = sent.join('\n');
  const missing = [...commandNames].filter((c) => c !== 'naddmenu' && !text.includes(`-${c}`));
  if (missing.length) errors.push(`menu missing: ${missing.join(', ')}`);
  console.log(JSON.stringify({commands: commandNames.size, aliases: aliasNames.size, menuHas: sent[0]?.length || 0, missingMenu: missing.length, errors}, null, 2));
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(2); });
