// Utility owner commands: number filter, warmer, autoresponder, surveys,
// group list/member export, bulk group create, bulk add, chat export, lines, menu.
const fs = require('fs');
const path = require('path');
const { parseArgs, parseRange, readFirstSheet, normPhone, toJid, bareJid, saveExcel, stamp, sleep, rand } = require('../lib/util.cjs');
const { filterNumbers } = require('../lib/numberfilter.cjs');
const { Warmer, DEFAULT_PLAN } = require('../lib/warmer.cjs');
const { loadRules, saveRules } = require('../lib/autoresponder.cjs');
const { Survey } = require('../lib/survey.cjs');
const { surveyReportXlsx } = require('../lib/reports.cjs');
const { listGroups } = require('../lib/groupcast.cjs');
const { createGroups, bulkAddMembers } = require('../lib/groupadmin.cjs');
const { exportMembersMulti } = require('../lib/members.cjs');
const { exportChatsXlsx } = require('../lib/exporter.cjs');
const { Campaign } = require('../lib/campaign.cjs');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function resolveInbox(p) {
  const inbox = path.join(__dirname, '..', 'inbox');
  const direct = path.resolve(p);
  if (fs.existsSync(direct)) return direct;
  const inInbox = path.join(inbox, p);
  if (fs.existsSync(inInbox)) return inInbox;
  throw new Error(`File not found: ${p} (put it in inbox/ or give a full path)`);
}

async function sendFile(ctx, file, caption) {
  await ctx.line.sock.sendMessage(ctx.chatJid, {
    document: { url: file }, fileName: path.basename(file), mimetype: XLSX_MIME, caption: caption || '',
  }, { quoted: ctx.msg });
}

let rrCursor = 0;
function pickLine(ctx) {
  const avail = ctx.lines.filter((l) => l.sock && l.ready);
  if (!avail.length) return null;
  return avail[(rrCursor++) % avail.length];
}

async function ensureGroups(ctx) {
  if (!ctx.groupCache.length) ctx.groupCache = await listGroups(ctx.line.sock);
  return ctx.groupCache;
}
function groupByIndex(ctx, idx) {
  const g = ctx.groupCache[Number(idx) - 1];
  if (!g) throw new Error(`No group #${idx}. Run -groups first.`);
  return g;
}

// ---------- number filter ----------
async function cmdFilter(ctx, args) {
  if (!args[0]) { await ctx.reply('Usage:\n-filter <file.xlsx>\nChecks every number with WhatsApp (no message sent) and returns a cleaned Excel.'); return; }
  const rows = readFirstSheet(resolveInbox(args[0]));
  const phones = rows.map((r) => r.phone ?? r.Phone ?? r.number ?? r.Number ?? r.mobile).filter(Boolean);
  await ctx.reply(`Checking ${phones.length} numbers…`);
  const out = await filterNumbers(ctx.line.sock, phones, async (d, t) => {
    if (d % 200 === 0) { try { await ctx.reply(`[filter] ${d}/${t}`); } catch (_) {} }
  });
  const on = out.filter((r) => r.on_whatsapp);
  const file = path.join(ctx.dataDir, 'reports', `filtered-${stamp()}.xlsx`);
  saveExcel(file, { OnWhatsApp: on, NotOnWhatsApp: out.filter((r) => !r.on_whatsapp), All: out });
  await sendFile(ctx, file, `Filter done: ${on.length}/${out.length} numbers are on WhatsApp.`);
}

// ---------- warmer ----------
async function cmdWarm(ctx, args) {
  const day = Math.max(1, Math.min(7, Number(args[0]) || 1));
  const seeds = (ctx.config.warmSeeds || []).map(bareJid);
  if (!seeds.length) { await ctx.reply('Add your own numbers/groups to warmSeeds in config.json first.'); return; }
  if (!ctx.warmer) ctx.warmer = new Warmer();
  const plan = DEFAULT_PLAN.find((p) => p.day === day);
  await ctx.reply(`Warmer day ${day}: ${plan.messages} natural messages to ${seeds.length} seed(s), 2-8 min gaps. Runs in background. -warmstop to stop.`);
  ctx.warmer.runDay({
    seeds,
    day,
    send: async (jid, content) => { const l = pickLine(ctx) || ctx.line; return l.sock.sendMessage(jid, content); },
    onEvent: async (e) => {
      try {
        if (e.type === 'sent' && e.done % 10 === 0) await ctx.reply(`[warm] day ${day}: ${e.done}/${e.total}`);
        else if (e.type === 'done') await ctx.reply(`[warm] day ${day} done: ${e.sent}/${e.planned} sent.`);
      } catch (_) {}
    },
  }).catch(async (e) => { try { await ctx.reply('[warm] error: ' + e.message); } catch (_) {} });
}

// ---------- autoresponder ----------
async function cmdAutoreply(ctx, args) {
  const sub = (args[0] || 'list').toLowerCase();
  const rules = loadRules(ctx.dataDir);
  if (sub === 'add') {
    const type = (args[1] || 'contains').toLowerCase();
    if (!['exact', 'contains', 'regex'].includes(type) || !args[2] || !args[3]) {
      await ctx.reply('Usage:\n-autoreply add <exact|contains|regex> <match> <reply text…>');
      return;
    }
    rules.push({ type, match: args[2], reply: args.slice(3).join(' '), enabled: true });
    saveRules(ctx.dataDir, rules);
    await ctx.reply(`Rule #${rules.length} added (${type}: "${args[2]}").`);
  } else if (sub === 'list') {
    if (!rules.length) { await ctx.reply('No autoresponder rules. Add one:\n-autoreply add contains price "Our price list…"'); return; }
    await ctx.reply(rules.map((r, i) => `${i + 1}. [${r.enabled === false ? 'off' : 'on'}] ${r.type} "${r.match}" -> "${r.reply.slice(0, 60)}"`).join('\n'));
  } else if (sub === 'del') {
    const i = Number(args[1]) - 1;
    if (!rules[i]) { await ctx.reply('Usage: -autoreply del <number>'); return; }
    rules.splice(i, 1); saveRules(ctx.dataDir, rules);
    await ctx.reply('Rule deleted.');
  } else if (sub === 'on' || sub === 'off') {
    const i = Number(args[1]) - 1;
    if (!rules[i]) { await ctx.reply('Usage: -autoreply on|off <number>'); return; }
    rules[i].enabled = sub === 'on'; saveRules(ctx.dataDir, rules);
    await ctx.reply(`Rule ${args[1]} ${sub === 'on' ? 'enabled' : 'disabled'}.`);
  } else if (sub === 'clear') {
    saveRules(ctx.dataDir, []);
    await ctx.reply('All autoresponder rules cleared.');
  } else {
    await ctx.reply('Usage:\n-autoreply add <exact|contains|regex> <match> <reply>\n-autoreply list\n-autoreply on|off <n>\n-autoreply del <n>');
  }
}

// ---------- surveys ----------
async function cmdSurvey(ctx, args) {
  const { flags, positional } = parseArgs(args);
  const campId = positional[0];
  const questions = (positional[1] || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!campId || !questions.length) {
    await ctx.reply('Usage:\n-survey <campaignId> "Question 1?|Question 2?|Question 3?" [--hours 48]\nSends Q1 to everyone the campaign reached, then follows up with each next question as they reply.');
    return;
  }
  const camp = ctx.campaigns.get(campId) || Campaign.load(campId, ctx.dataDir);
  if (!camp) { await ctx.reply('Campaign not found.'); return; }
  const targets = camp.results.filter((r) => r.messageId && r.status !== 'failed').map((r) => toJid(r.phone));
  if (!targets.length) { await ctx.reply('No reachable recipients in that campaign yet.'); return; }
  const id = 's' + Date.now().toString(36);
  const survey = new Survey(id, questions, Number(flags.hours) || 48);
  survey.target(targets);
  ctx.surveys.set(id, survey);
  await ctx.reply(`Survey ${id}: sending Q1 to ${targets.length} people…`);
  (async () => {
    let done = 0;
    for (const jid of targets) {
      const line = pickLine(ctx) || ctx.line;
      try { await line.sock.sendMessage(jid, { text: questions[0] }); done++; } catch (_) {}
      if (done % 25 === 0) { try { await ctx.reply(`[survey ${id}] Q1 sent to ${done}/${targets.length}`); } catch (_) {} }
      await sleep(rand(15, 40) * 1000);
    }
    try { await ctx.reply(`[survey ${id}] Q1 sent to ${done}/${targets.length}. Replies auto-collect for ${flags.hours || 48}h.\n-surveyreport ${id}`); } catch (_) {}
  })().catch(() => {});
}

async function cmdSurveyReport(ctx, args) {
  const s = ctx.surveys.get(args[0]);
  if (!s) { await ctx.reply('Usage: -surveyreport <surveyId>'); return; }
  const file = surveyReportXlsx(s, path.join(ctx.dataDir, 'reports'));
  const tally = s.tally().map((t) => `Q: ${t.question}\nResponses: ${t.responses}\n${t.top}`).join('\n\n');
  await sendFile(ctx, file, `Survey ${s.id}: ${s.answers.length} answers, ${s.remaining} pending.\n\n${tally}`.slice(0, 4000));
}

// ---------- groups ----------
async function cmdGroups(ctx) {
  const groups = await ensureGroups(ctx);
  if (!groups.length) { await ctx.reply('This line is not in any groups.'); return; }
  const lines = groups.slice(0, 60).map((g, i) => `${i + 1}. ${g.name} (${g.members})`);
  await ctx.reply(`Groups on this line (${groups.length}):\n` + lines.join('\n') + (groups.length > 60 ? `\n…+${groups.length - 60} more` : ''));
}

async function cmdMembers(ctx, args) {
  const groups = await ensureGroups(ctx);
  let picks;
  if (!args[0] || args[0].toLowerCase() === 'all') picks = groups;
  else picks = args[0].split(',').map((a) => groupByIndex(ctx, a.trim()));
  await ctx.reply(`Extracting members from ${picks.length} group(s)…`);
  const sheets = await exportMembersMulti(ctx.line.sock, picks.map((g) => g.jid));
  const file = path.join(ctx.dataDir, 'reports', `members-${stamp()}.xlsx`);
  saveExcel(file, sheets);
  const total = (sheets.ALL || []).length;
  await sendFile(ctx, file, `Member export: ${total} members across ${picks.length} group(s).`);
}

async function cmdMakeGroups(ctx, args) {
  const { flags, positional } = parseArgs(args);
  const names = (positional[0] || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!names.length) { await ctx.reply('Usage:\n-makegroups "Group One|Group Two" [--file inbox/phones.xlsx] [--delay 20]'); return; }
  let participants = [];
  if (flags.file) {
    const rows = readFirstSheet(resolveInbox(flags.file));
    participants = rows.map((r) => normPhone(r.phone ?? r.Phone ?? r.number)).filter(Boolean).map(toJid);
  }
  await ctx.reply(`Creating ${names.length} group(s)…`);
  const results = await createGroups({
    sock: ctx.line.sock, names, participantJids: participants,
    delaySec: Number(flags.delay) || 20,
    onEvent: async (e) => { try { if (e.type === 'created') await ctx.reply(`[makegroups] created "${e.name}"`); } catch (_) {} },
  });
  const ok = results.filter((r) => r.status === 'created');
  await ctx.reply(`[makegroups] done: ${ok.length}/${results.length} created.` + (ok.length ? '\n' + ok.map((r) => `• ${r.name}`).join('\n') : ''));
}

async function cmdAddMembers(ctx, args) {
  const { flags, positional } = parseArgs(args);
  if (positional.length < 2) { await ctx.reply('Usage:\n-addmembers <group#> <file.xlsx> [--chunk 10] [--delay 30]\nAdds numbers (phone column) to a group where this line is admin. Only add people who agreed to join.'); return; }
  const g = groupByIndex(ctx, positional[0]);
  const rows = readFirstSheet(resolveInbox(positional[1]));
  const phones = rows.map((r) => r.phone ?? r.Phone ?? r.number ?? r.Number).filter(Boolean);
  await ctx.reply(`Adding ${phones.length} members to "${g.name}"…`);
  try {
    const results = await bulkAddMembers({
      sock: ctx.line.sock, groupJid: g.jid, phones,
      chunkSize: Number(flags.chunk) || 10, delaySec: Number(flags.delay) || 30,
      onEvent: async (e) => { try { if (e.type === 'chunk') await ctx.reply(`[addmembers] ${e.done}/${e.total}`); } catch (_) {} },
    });
    const added = results.filter((r) => r.status === 'added').length;
    const file = path.join(ctx.dataDir, 'reports', `addmembers-${stamp()}.xlsx`);
    saveExcel(file, { Results: results });
    await sendFile(ctx, file, `[addmembers] ${added}/${results.length} added to "${g.name}".`);
  } catch (e) {
    await ctx.reply('[addmembers] ' + e.message);
  }
}

// ---------- misc ----------
async function cmdExportChats(ctx) {
  await ctx.reply('Exporting chats + contacts…');
  const { file, groups, contacts } = await exportChatsXlsx(ctx.line.sock, ctx.contacts, path.join(ctx.dataDir, 'reports'));
  await sendFile(ctx, file, `Export: ${groups} groups, ${contacts} contacts seen this session.`);
}

async function cmdLines(ctx) {
  const lines = ctx.lines.map((l) => `• ${l.id}: ${l.ready ? 'connected as ' + l.jid : 'not connected'}`);
  await ctx.reply('Lines:\n' + (lines.join('\n') || '(none)'));
}

async function cmdMenu(ctx) {
  const p = ctx.prefix;
  await ctx.reply(
`WA Broadcast Suite — commands (owner only):

BULK SENDER
${p}cast <file.xlsx> "msg {name}" [--media f] [--type image] [--delay 25-70] [--batch 40] [--pause 300]
${p}caststatus <id> | ${p}castreport <id> | ${p}castpause <id> | ${p}castresume <id> | ${p}caststop <id>
${p}filter <file.xlsx> — keep only numbers on WhatsApp
${p}groupcast "msg" [--media f] — broadcast to my groups

GROUPS
${p}groups — list my groups
${p}members all | 1,3 — export member numbers to Excel
${p}makegroups "A|B" [--file x.xlsx] — mass-create groups
${p}addmembers <#> <file.xlsx> — bulk add (admin only)

ENGAGEMENT
${p}autoreply add <exact|contains|regex> <match> <reply>
${p}survey <campaignId> "Q1?|Q2?" — smart follow-up survey
${p}surveyreport <id>
${p}warm <day 1-7> | ${p}warmstop — warm up a new line

OTHER
${p}exportchats — groups + contacts to Excel
${p}lines — line status
${p}menu — this help

Files go in the inbox/ folder. Only message people who opted in.`
  );
}

module.exports = {
  commands: {
    filter: cmdFilter,
    warm: cmdWarm,
    warmstop: async (ctx) => { if (ctx.warmer) ctx.warmer.stop(); await ctx.reply('Warmer stopped.'); },
    autoreply: cmdAutoreply,
    survey: cmdSurvey,
    surveyreport: cmdSurveyReport,
    groups: cmdGroups,
    members: cmdMembers,
    makegroups: cmdMakeGroups,
    addmembers: cmdAddMembers,
    exportchats: cmdExportChats,
    lines: cmdLines,
    menu: cmdMenu,
    help: cmdMenu,
  },
};
