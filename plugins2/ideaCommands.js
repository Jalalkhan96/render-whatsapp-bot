'use strict';

const os = require('os');
const settings = require('../settings');
const store = require('../lib/lightweight_store');
const adminOnly = require('../lib/adminOnly');
const isAdmin = require('../lib/isAdmin');

const ECONOMY_KEY = 'ideaEconomyUsers';
const TX_KEY = 'ideaEconomyTransactions';
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const STARTING_BALANCE = Math.max(0, Number(process.env.ECONOMY_STARTING_BALANCE || 1000));
const DAILY_REWARD = Math.max(1, Number(process.env.ECONOMY_DAILY_REWARD || 500));
const TRANSFER_TAX = Math.min(0.25, Math.max(0, Number(process.env.ECONOMY_TRANSFER_TAX || 0.02)));
const LOAN_LIMIT = Math.max(1000, Number(process.env.ECONOMY_LOAN_LIMIT || 10000));
const LOAN_INTEREST = Math.min(0.5, Math.max(0, Number(process.env.ECONOMY_LOAN_INTEREST || 0.05)));
const LOAN_DURATION = Math.max(1, Number(process.env.ECONOMY_LOAN_HOURS || 24)) * 60 * 60 * 1000;
const CURRENCY = process.env.ECONOMY_CURRENCY_NAME || 'Coins';

function userKey(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function money(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString('en-US')} ${CURRENCY}`;
}

function amount(raw) {
  if (!raw) return 0;
  const value = String(raw).trim().toLowerCase().replace(/,/g, '');
  if (value === 'all') return Infinity;
  const suffix = value.match(/^([0-9]+(?:\.[0-9]+)?)(k|m|b)?$/);
  if (!suffix) return 0;
  const base = Number(suffix[1]);
  const multiplier = suffix[2] === 'k' ? 1e3 : suffix[2] === 'm' ? 1e6 : suffix[2] === 'b' ? 1e9 : 1;
  const result = base * multiplier;
  return Number.isFinite(result) ? Math.floor(result) : 0;
}

async function loadUsers() {
  const value = await store.getSetting('global', ECONOMY_KEY);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function saveUsers(users) {
  await store.saveSetting('global', ECONOMY_KEY, users);
}

async function loadTx() {
  const value = await store.getSetting('global', TX_KEY);
  return Array.isArray(value) ? value : [];
}

async function recordTx(type, from, to, value, meta = '') {
  const tx = await loadTx();
  tx.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, type, from, to, amount: value, meta, at: Date.now() });
  await store.saveSetting('global', TX_KEY, tx.slice(-500));
}

async function ensureUser(users, id, name = 'User') {
  if (!users[id]) {
    users[id] = {
      id,
      name: String(name || 'User').slice(0, 80),
      wallet: STARTING_BALANCE,
      bank: 0,
      xp: 0,
      lastDaily: 0,
      loan: null,
    };
  } else if (name && users[id].name === 'User') {
    users[id].name = String(name).slice(0, 80);
  }
  return users[id];
}

function parseTarget(message, args = []) {
  const mentioned = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.participant;
  return mentioned || quoted || args[0] || '';
}

function formatRemaining(target) {
  const remaining = Math.max(0, target - Date.now());
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m`;
}

async function send(sock, message, text) {
  return sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

async function economyHandler(sock, message, args, context, action) {
  const chatId = context.chatId || message.key.remoteJid;
  const senderId = userKey(context.senderId || message.key.participant || chatId);
  const users = await loadUsers();
  const me = await ensureUser(users, senderId, message.pushName || 'User');

  if (action === 'balance' || action === 'bank') {
    const total = me.wallet + me.bank;
    return send(sock, message,
      `💰 *ACCOUNT*\n\n` +
      `👤 ${me.name}\n` +
      `💵 Wallet: *${money(me.wallet)}*\n` +
      `🏦 Bank: *${money(me.bank)}*\n` +
      `📊 Total: *${money(total)}*\n` +
      `⭐ XP: *${me.xp}*`);
  }

  if (action === 'daily') {
    if (Date.now() - Number(me.lastDaily || 0) < DAILY_COOLDOWN) {
      return send(sock, message, `⏳ Daily already claimed. Try again in *${formatRemaining(Number(me.lastDaily) + DAILY_COOLDOWN)}*.`);
    }
    me.lastDaily = Date.now();
    me.wallet += DAILY_REWARD;
    me.xp += 100;
    await saveUsers(users);
    await recordTx('daily', '', senderId, DAILY_REWARD);
    return send(sock, message, `🎁 *DAILY REWARD*\n\n+${money(DAILY_REWARD)}\n+100 XP\n\nNew wallet: *${money(me.wallet)}*`);
  }

  if (action === 'deposit' || action === 'withdraw') {
    let value = amount(args[0]);
    if (value === Infinity) value = action === 'deposit' ? me.wallet : me.bank;
    if (!value || value < 1) return send(sock, message, `Use: *${settings.prefixes[0] || '-'}${action} <amount>*\nExample: *${settings.prefixes[0] || '-'}${action} 500*`);
    if (action === 'deposit' && value > me.wallet) return send(sock, message, `❌ Wallet balance is only *${money(me.wallet)}*.`);
    if (action === 'withdraw' && value > me.bank) return send(sock, message, `❌ Bank balance is only *${money(me.bank)}*.`);
    if (action === 'deposit') { me.wallet -= value; me.bank += value; }
    else { me.bank -= value; me.wallet += value; }
    await saveUsers(users);
    await recordTx(action, senderId, senderId, value);
    return send(sock, message, `✅ *${action.toUpperCase()}*\n\nAmount: *${money(value)}*\nWallet: *${money(me.wallet)}*\nBank: *${money(me.bank)}*`);
  }

  if (action === 'transfer') {
    const mentioned = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.participant;
    const hasExplicitTarget = Boolean(mentioned || quoted);
    const targetJid = mentioned || quoted || args[0] || '';
    const target = userKey(targetJid);
    const valueArg = hasExplicitTarget ? args[0] : args[1];
    if (!target || target === senderId) return send(sock, message, `Mention or reply to a user.\nExample: *${settings.prefixes[0] || '-'}transfer @user 500*`);
    let value = amount(valueArg);
    if (!value || !Number.isFinite(value)) return send(sock, message, `Use: *${settings.prefixes[0] || '-'}transfer @user <amount>*`);
    if (value > me.wallet) return send(sock, message, `❌ Wallet balance is only *${money(me.wallet)}*.`);
    const fee = Math.floor(value * TRANSFER_TAX);
    const receiver = await ensureUser(users, target, targetJid || target);
    me.wallet -= value;
    receiver.wallet += value - fee;
    await saveUsers(users);
    await recordTx('transfer', senderId, target, value, `fee=${fee}`);
    return send(sock, message, `💸 *TRANSFER COMPLETE*\n\nSent: *${money(value)}*\nFee: *${money(fee)}*\nReceiver got: *${money(value - fee)}*\nYour wallet: *${money(me.wallet)}*`);
  }

  if (action === 'richest') {
    const ranked = Object.values(users).sort((a, b) => (Number(b.wallet) + Number(b.bank)) - (Number(a.wallet) + Number(a.bank))).slice(0, 10);
    if (!ranked.length) return send(sock, message, 'No economy users yet.');
    const lines = ranked.map((u, i) => `${i + 1}. *${String(u.name || u.id).slice(0, 24)}* — ${money(Number(u.wallet) + Number(u.bank))}`);
    return send(sock, message, `🏆 *RICHEST USERS*\n\n${lines.join('\n')}`);
  }

  if (action === 'transactions') {
    const tx = (await loadTx()).filter(x => x.from === senderId || x.to === senderId).slice(-10).reverse();
    if (!tx.length) return send(sock, message, '📭 No transactions yet.');
    const lines = tx.map(x => `${new Date(x.at).toLocaleString('en-PK')} • *${x.type}* • ${money(x.amount)}`);
    return send(sock, message, `🧾 *RECENT TRANSACTIONS*\n\n${lines.join('\n')}`);
  }

  if (action === 'loan') {
    const sub = String(args[0] || 'status').toLowerCase();
    if (sub === 'status') {
      if (!me.loan) return send(sock, message, `🏦 No active loan. Limit: *${money(LOAN_LIMIT)}*.`);
      return send(sock, message, `🏦 *LOAN STATUS*\nPrincipal: *${money(me.loan.principal)}*\nDue: *${new Date(me.loan.due).toLocaleString('en-PK')}*\nRepay: *${money(me.loan.repay)}*`);
    }
    if (sub === 'take') {
      if (me.loan) return send(sock, message, '❌ You already have an active loan.');
      const value = Math.min(LOAN_LIMIT, amount(args[1]));
      if (!value) return send(sock, message, `Use: *${settings.prefixes[0] || '-'}loan take 5000* (max ${money(LOAN_LIMIT)})`);
      const due = Date.now() + LOAN_DURATION;
      const repay = Math.floor(value * (1 + LOAN_INTEREST));
      me.loan = { principal: value, repay, due, takenAt: Date.now() };
      me.wallet += value;
      await saveUsers(users);
      await recordTx('loan', '', senderId, value, `repay=${repay}`);
      return send(sock, message, `✅ *LOAN APPROVED*\nBorrowed: *${money(value)}*\nRepay: *${money(repay)}*\nDue: *${new Date(due).toLocaleString('en-PK')}*`);
    }
    if (sub === 'repay') {
      if (!me.loan) return send(sock, message, '❌ No active loan.');
      if (me.wallet < me.loan.repay) return send(sock, message, `❌ You need *${money(me.loan.repay)}* in your wallet.`);
      const paid = me.loan.repay;
      me.wallet -= paid;
      me.loan = null;
      me.xp += 50;
      await saveUsers(users);
      await recordTx('loan-repay', senderId, '', paid);
      return send(sock, message, `✅ *LOAN REPAID*\nPaid: *${money(paid)}*\n+50 XP\nWallet: *${money(me.wallet)}*`);
    }
    return send(sock, message, `Use: *${settings.prefixes[0] || '-'}loan status|take <amount>|repay*`);
  }

  await saveUsers(users);
  return send(sock, message, `Use *${settings.prefixes[0] || '-'}${action}* with valid arguments.`);
}

const commands = [
  {
    command: 'count', aliases: [], category: 'group', groupOnly: true,
    description: 'Show total members in the current group', usage: '-count',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      if (!chatId.endsWith('@g.us')) return send(sock, message, '❌ This command can only be used in a group.');
      const metadata = await sock.groupMetadata(chatId);
      return send(sock, message, `👥 *GROUP COUNT*\n\n🏠 ${metadata.subject || 'Group'}\n👤 Members: *${metadata.participants?.length || 0}*`);
    },
  },
  {
    command: 'adminonly', aliases: ['adminmode'], category: 'owner', ownerOnly: true,
    description: 'Allow only group admins to use public bot commands in a group', usage: '-adminonly on|off',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      if (!chatId.endsWith('@g.us')) return send(sock, message, '❌ This command can only be used inside a group.');
      const action = String(args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(action)) return send(sock, message, `Usage: *${settings.prefixes[0] || '-'}adminonly on|off*`);
      await adminOnly.setEnabled(chatId, action === 'on');
      return send(sock, message, `🛡️ *ADMIN ONLY* is now *${action.toUpperCase()}* in this group.`);
    },
  },
  { command: 'balance', aliases: ['bal', 'wallet', 'account'], category: 'economy', description: 'View wallet and bank balance', usage: '-balance', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'balance'); } },
  { command: 'bank', aliases: ['banking'], category: 'economy', description: 'View wallet and bank account', usage: '-bank', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'bank'); } },
  { command: 'daily', aliases: ['claim', 'dailyclaim'], category: 'economy', description: 'Claim daily reward and XP', usage: '-daily', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'daily'); } },
  { command: 'deposit', aliases: ['dep', 'bankdep'], category: 'economy', description: 'Move coins from wallet to bank', usage: '-deposit <amount>', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'deposit'); } },
  { command: 'withdraw', aliases: ['bankwith'], category: 'economy', description: 'Move coins from bank to wallet', usage: '-withdraw <amount>', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'withdraw'); } },
  { command: 'transfer', aliases: ['pay', 'send'], category: 'economy', description: 'Transfer coins to another user', usage: '-transfer @user <amount>', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'transfer'); } },
  { command: 'richest', aliases: ['econlb'], category: 'economy', description: 'Show the richest users', usage: '-richest', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'richest'); } },
  { command: 'transactions', aliases: ['tx'], category: 'economy', description: 'Show your latest economy transactions', usage: '-transactions', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'transactions'); } },
  { command: 'loan', aliases: ['borrow'], category: 'economy', description: 'Simple borrow/repay economy feature', usage: '-loan status|take <amount>|repay', async handler(s,m,a,c) { return economyHandler(s,m,a,c,'loan'); } },
  {
    command: 'stats', aliases: [], category: 'system', description: 'Show runtime, Node and command registry status', usage: '-stats',
    async handler(sock, message, args, context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      const commandHandler = require('../lib/commandHandler');
      const report = commandHandler.getLoadReport();
      const up = process.uptime();
      const h = Math.floor(up / 3600); const m = Math.floor((up % 3600) / 60); const sec = Math.floor(up % 60);
      return sock.sendMessage(chatId, { text: `📊 *ABIX RUNTIME*\n\n🟢 Status: Online\n⏱️ Uptime: *${h}h ${m}m ${sec}s*\n🟢 Node: *${process.version}*\n📦 Commands: *${report.loaded}*\n♻️ Duplicates: *${report.duplicates}*\n🧩 Broken: *${report.broken}*\n💾 Store: *${store.getStats().backend}*\n🖥️ Platform: *${os.platform()}*` }, { quoted: message });
    },
  },
];

module.exports = commands;
