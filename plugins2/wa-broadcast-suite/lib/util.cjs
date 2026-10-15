// Shared helpers: timing, phone/JID handling, arg parsing, Excel IO.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// Keep only digits; valid international numbers are 8-15 digits.
function normPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

const toJid = (phone) => `${phone}@s.whatsapp.net`;
// strip device suffix (1234:56@...) -> bare jid
const bareJid = (jid) => String(jid || '').split(':')[0];
const jidToPhone = (jid) => bareJid(jid).split('@')[0];

// Split a command line on spaces, keeping "quoted strings" together.
function tokenize(input) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Parse ["--media","x","--delay","20-60","pos1"] -> { flags:{media:'x',delay:'20-60'}, positional:['pos1'] }
function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function parseRange(s, defMin, defMax) {
  if (!s) return [defMin, defMax];
  const parts = String(s).split('-').map(Number);
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n >= 0)) return parts;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) return [n, n];
  return [defMin, defMax];
}

function getText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function saveExcel(filePath, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows && rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
  return filePath;
}

function readFirstSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

module.exports = {
  sleep, rand, randInt, normPhone, toJid, bareJid, jidToPhone,
  tokenize, parseArgs, parseRange, getText, saveExcel, readFirstSheet, stamp,
};
