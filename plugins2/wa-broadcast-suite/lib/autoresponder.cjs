// Editable autoresponder: keyword / exact / regex rules stored in JSON.
const fs = require('fs');
const path = require('path');

const rulesPath = (dataDir) => path.join(dataDir, 'autoresponder.json');

function loadRules(dataDir) {
  try {
    const r = JSON.parse(fs.readFileSync(rulesPath(dataDir), 'utf8'));
    return Array.isArray(r) ? r : [];
  } catch (_) { return []; }
}

function saveRules(dataDir, rules) {
  fs.mkdirSync(path.dirname(rulesPath(dataDir)), { recursive: true });
  fs.writeFileSync(rulesPath(dataDir), JSON.stringify(rules, null, 2));
}

// rule: { type: 'exact'|'contains'|'regex', match: string, reply: string, enabled: true }
function matchRule(rules, text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  for (const r of rules) {
    if (r.enabled === false) continue;
    try {
      if (r.type === 'exact' && t === String(r.match).toLowerCase()) return r;
      else if (r.type === 'contains' && t.includes(String(r.match).toLowerCase())) return r;
      else if (r.type === 'regex' && new RegExp(r.match, 'i').test(text)) return r;
    } catch (_) { /* bad regex -> skip */ }
  }
  return null;
}

module.exports = { loadRules, saveRules, matchRule };
