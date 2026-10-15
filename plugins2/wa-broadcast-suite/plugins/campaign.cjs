// Campaign + group-broadcast owner commands.
const fs = require('fs');
const path = require('path');
const { parseArgs, parseRange, readFirstSheet, normPhone } = require('../lib/util.cjs');
const { Campaign } = require('../lib/campaign.cjs');
const { campaignReportXlsx, campaignTextSummary } = require('../lib/reports.cjs');
const { listGroups, broadcastGroups } = require('../lib/groupcast.cjs');

const sendVia = async (line, jid, content) => {
  const r = await line.sock.sendMessage(jid, content);
  return { messageId: r.key.id };
};

function resolveInbox(p) {
  const inbox = path.join(__dirname, '..', 'inbox');
  const direct = path.resolve(p);
  if (fs.existsSync(direct)) return direct;
  const inInbox = path.join(inbox, p);
  if (fs.existsSync(inInbox)) return inInbox;
  throw new Error(`File not found: ${p} (tried ${direct} and inbox/${p})`);
}

async function cmdCast(ctx, args) {
  // -cast contacts.xlsx "Hello {name}..." [--media ./promo.jpg] [--type image] [--delay 25-70] [--batch 40] [--pause 300]
  const { flags, positional } = parseArgs(args);
  if (positional.length < 2) {
    await ctx.reply('Usage:\n-cast <file.xlsx> "message with {name}" [--media <path>] [--type image|video|document|audio] [--delay 25-70] [--batch 40] [--pause 300]\n\nPut the Excel in the inbox/ folder. Columns: phone, name, ...any {variable}.');
    return;
  }
  const rows = readFirstSheet(resolveInbox(positional[0]));
  const id = 'c' + Date.now().toString(36);
  const camp = new Campaign(id, ctx.dataDir);
  const n = camp.loadContacts(rows);
  if (!n) { await ctx.reply('No valid phone numbers found in that file. Need a phone column with full international numbers.'); return; }
  ctx.campaigns.set(id, camp);

  const [dMin, dMax] = parseRange(flags.delay, 25, 70);
  let media = null;
  if (flags.media) media = { path: resolveInbox(flags.media), type: flags.type || 'image' };

  await ctx.reply(`Campaign ${id} starting: ${n} contacts, delay ${dMin}-${dMax}s, batch ${flags.batch || 40}. Progress updates every 25 sends.\n-castpause / -castresume / -caststop ${id}`);

  camp.start({
    send: sendVia,
    lines: ctx.lines,
    message: positional[1],
    media,
    delayMin: dMin, delayMax: dMax,
    batchSize: Number(flags.batch) || 40,
    batchPauseSec: Number(flags.pause) || 300,
    onEvent: async (e) => {
      try {
        if (e.type === 'sent' && e.done % 25 === 0) await ctx.reply(`[${id}] ${e.done}/${e.total} sent (line ${e.line})`);
        else if (e.type === 'batch-pause') await ctx.reply(`[${id}] batch pause ${e.seconds}s…`);
        else if (e.type === 'done') await ctx.reply(`[${id}] finished: ${e.status}\n` + campaignTextSummary(camp) + `\n\n-castreport ${id} for the Excel report.`);
      } catch (_) {}
    },
  }).catch(async (e) => { try { await ctx.reply(`[${id}] crashed: ${e.message}`); } catch (_) {} });
}

async function cmdCastControl(ctx, args, action) {
  const id = args[0];
  const camp = ctx.campaigns.get(id) || (id ? Campaign.load(id, ctx.dataDir) : null);
  if (!camp) { await ctx.reply('Campaign not found. Usage: -' + action + ' <id>'); return; }
  if (!ctx.campaigns.has(id)) ctx.campaigns.set(id, camp);
  if (action === 'castpause') { camp.pause(); await ctx.reply(`[${id}] paused.`); }
  else if (action === 'castresume') {
    camp.resume();
    await ctx.reply(`[${id}] resumed.`);
    if (camp.status === 'running') return;
    // was paused mid-run; restart loop picks up where it left off (resume-safe)
    cmdCastResumeRun(ctx, camp);
  } else if (action === 'caststop') { camp.stop(); await ctx.reply(`[${id}] stopped.`); }
}

async function cmdCastResumeRun(ctx, camp) {
  // re-enters start() with original opts stored on the campaign file is overkill;
  // simplest: owner re-runs -cast — this path only resumes a paused loop.
  await ctx.reply('Resume continues automatically if the loop is still alive. If the bot restarted, re-run -cast (already-sent contacts are skipped).');
}

async function cmdCastStatus(ctx, args) {
  const id = args[0];
  const camp = ctx.campaigns.get(id) || (id ? Campaign.load(id, ctx.dataDir) : null);
  if (!camp) { await ctx.reply('Usage: -caststatus <id>'); return; }
  await ctx.reply(campaignTextSummary(camp));
}

async function cmdCastReport(ctx, args) {
  const id = args[0];
  const camp = ctx.campaigns.get(id) || (id ? Campaign.load(id, ctx.dataDir) : null);
  if (!camp) { await ctx.reply('Usage: -castreport <id>'); return; }
  const file = campaignReportXlsx(camp, path.join(ctx.dataDir, 'reports'));
  await ctx.line.sock.sendMessage(ctx.chatJid, {
    document: { url: file },
    fileName: path.basename(file),
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    caption: campaignTextSummary(camp),
  }, { quoted: ctx.msg });
}

async function cmdGroupcast(ctx, args) {
  // -groupcast "message" [--media ./x.jpg] [--delay 30-90]
  const { flags, positional } = parseArgs(args);
  if (!positional.length) { await ctx.reply('Usage:\n-groupcast "message to all my groups" [--media <path>] [--delay 30-90]'); return; }
  const groups = await listGroups(ctx.line.sock);
  ctx.groupCache = groups;
  if (!groups.length) { await ctx.reply('This line is not in any groups.'); return; }
  const [dMin, dMax] = parseRange(flags.delay, 30, 90);
  const media = flags.media ? resolveInbox(flags.media) : null;
  await ctx.reply(`Broadcasting to ${groups.length} groups, delay ${dMin}-${dMax}s…`);
  const results = await broadcastGroups({
    sock: ctx.line.sock, jids: groups.map((g) => g.jid),
    message: positional[0], media, delayMin: dMin, delayMax: dMax,
    onEvent: async (e) => { try { if (e.type === 'sent' && e.done % 10 === 0) await ctx.reply(`[groupcast] ${e.done}/${e.total}`); } catch (_) {} },
  });
  const ok = results.filter((r) => r.status === 'sent').length;
  await ctx.reply(`[groupcast] done: ${ok}/${results.length} groups reached.`);
}

module.exports = {
  commands: {
    cast: cmdCast,
    castpause: (c, a) => cmdCastControl(c, a, 'castpause'),
    castresume: (c, a) => cmdCastControl(c, a, 'castresume'),
    caststop: (c, a) => cmdCastControl(c, a, 'caststop'),
    caststatus: cmdCastStatus,
    castreport: cmdCastReport,
    groupcast: cmdGroupcast,
  },
};
