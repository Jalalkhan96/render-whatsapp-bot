'use strict';

const { commands: toolCommands } = require('./plugins/tools.cjs');
const { commands: campaignCommands } = require('./plugins/campaign.cjs');
const { buildContext } = require('./runtime.cjs');

function wrap(fn) {
  return async (sock, message, args, context = {}) => {
    const suiteContext = buildContext(sock, message, context);
    return fn(suiteContext, args, context.rawText || '');
  };
}

function menuHandler(sock, message, args, context = {}) {
  const p = context.prefix || '-';
  const text = [
    '📣 *WA BROADCAST SUITE*',
    '',
    'Owner-only tools integrated with the main ABIX WhatsApp session.',
    '',
    '*BULK / CAMPAIGN*',
    `${p}cast <file.xlsx> "message {name}" [--media file] [--type image|video|document|audio]`,
    `${p}caststatus <id>`,
    `${p}castreport <id>`,
    `${p}castpause <id>`,
    `${p}castresume <id>`,
    `${p}caststop <id>`,
    `${p}filter <file.xlsx>`,
    `${p}groupcast "message" [--media file]`,
    '',
    '*GROUP TOOLS*',
    `${p}groups`,
    `${p}members all | 1,3`,
    `${p}makegroups "Group One|Group Two" [--file phones.xlsx]`,
    `${p}addmembers <group#> <file.xlsx>`,
    '',
    '*ENGAGEMENT*',
    `${p}autoreply add <exact|contains|regex> <match> <reply>`,
    `${p}autoreply list`,
    `${p}survey <campaignId> "Q1?|Q2?"`,
    `${p}surveyreport <id>`,
    `${p}warm 1 ... ${p}warm 7`,
    `${p}warmstop`,
    '',
    '*REPORTING*',
    `${p}exportchats`,
    `${p}lines`,
    `${p}bcastmenu`,
    '',
    '📁 Suite files: plugins2/wa-broadcast-suite/inbox/',
    '💾 State/reports: data/wa-broadcast-suite/',
    '✅ Use only with contacts/groups where messaging is permitted.'
  ].join('\n');

  return sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
}

const commandMap = {
  broadcastmenu: menuHandler,
  cast: campaignCommands.cast,
  castpause: campaignCommands.castpause,
  castresume: campaignCommands.castresume,
  caststop: campaignCommands.caststop,
  caststatus: campaignCommands.caststatus,
  castreport: campaignCommands.castreport,
  groupcast: campaignCommands.groupcast,
  filter: toolCommands.filter,
  warm: toolCommands.warm,
  warmstop: toolCommands.warmstop,
  autoreply: toolCommands.autoreply,
  survey: toolCommands.survey,
  surveyreport: toolCommands.surveyreport,
  groups: toolCommands.groups,
  members: toolCommands.members,
  makegroups: toolCommands.makegroups,
  addmembers: toolCommands.addmembers,
  exportchats: toolCommands.exportchats,
  lines: toolCommands.lines,
};

const menuCommand = {
  command: 'broadcastmenu',
  aliases: ['bcastmenu', 'broadcastsuite', 'wbs'],
  category: 'broadcast',
  description: 'WA Broadcast Suite command menu',
  ownerOnly: true,
  dedicatedMenu: false,
  handler: menuHandler,
};

module.exports = [
  menuCommand,
  ...Object.entries(commandMap)
    .filter(([name]) => name !== 'broadcastmenu')
    .map(([name, fn]) => ({
      command: name,
      category: 'broadcast',
      description: `WA Broadcast Suite: ${name}`,
      ownerOnly: true,
      handler: wrap(fn),
    })),
];
