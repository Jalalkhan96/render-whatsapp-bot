'use strict';

const {
  generateTextProImage,
  getLatestTemplates,
  searchTextPro,
} = require('../lib/textproService.cjs');
const {
  ALL_TEMPLATES,
  POPULAR_TEMPLATES,
  NEW_TEMPLATES,
  EPHOTO_POPULAR_TEMPLATES,
  EPHOTO_NEW_TEMPLATES,
  BIRTHDAY_POPULAR_TEMPLATES,
  BIRTHDAY_NEW_TEMPLATES,
  SITE_CONFIGS,
  getSiteTemplates,
  resolveTemplate,
  resolveSiteKey,
  isAllowedEffectUrl,
  splitTextFields,
  templateUsage,
  safeText,
} = require('../lib/textproCatalog.cjs');

const SITE_GROUPS = Object.freeze({
  textpro: { popular: POPULAR_TEMPLATES, new: NEW_TEMPLATES },
  ephoto: { popular: EPHOTO_POPULAR_TEMPLATES, new: EPHOTO_NEW_TEMPLATES },
  birthdaycake: { popular: BIRTHDAY_POPULAR_TEMPLATES, new: BIRTHDAY_NEW_TEMPLATES },
});

function prefixOf(context) { return String(context?.prefix || '-'); }
function chatOf(message, context) { return context?.chatId || message?.key?.remoteJid; }

async function sendText(sock, message, context, text) {
  const chat = chatOf(message, context);
  if (!chat) return;
  return sock.sendMessage(chat, { text: String(text) }, message ? { quoted: message } : undefined);
}

function siteMainCommand(siteKey) {
  return siteKey === 'ephoto' ? 'ephoto' : siteKey === 'birthdaycake' ? 'birthdaycake' : 'textpro';
}

function siteHelp(siteKey, prefix) {
  const site = SITE_CONFIGS[siteKey];
  const pop = site.popularCommand;
  const newest = site.newCommand;
  const search = site.searchCommand;
  const entries = getSiteTemplates(siteKey, 'all');
  return [
    `⚡ ABIX // ${site.label.toUpperCase()} LAB`,
    '━━━━━━━━━━━━━━━━━━',
    `Generate text effects and greeting images using ${site.label}.`,
    '',
    'DISCOVERY',
    `${prefix}${pop} — popular templates`,
    `${prefix}${newest} — latest templates`,
    `${prefix}${search} <keyword> — search templates`,
    '',
    'INDIVIDUAL TEMPLATE COMMANDS',
    ...entries.map(item => `${prefix}${item.command} YOUR TEXT${item.inputs > 1 ? `  (${item.inputs} fields separated by |)` : ''}`),
    '',
    'CUSTOM EFFECT',
    `${prefix}${siteMainCommand(siteKey)} <effect-key> | YOUR TEXT`,
    `Site: ${site.baseUrl}`,
  ].join('\n');
}

function helpText(prefix) {
  return [
    '⚡ ABIX // MULTI-SITE EFFECT LAB',
    '━━━━━━━━━━━━━━━━━━',
    'Generate text effects, logos, and birthday greetings across three supported sites.',
    '',
    'SITES',
    `${prefix}textpro — TextPro.me`,
    `${prefix}ephoto — Ephoto360 English`,
    `${prefix}birthdaycake — BirthdayCake24`,
    '',
    'POPULAR / LATEST / SEARCH',
    `${prefix}tppopular  ·  ${prefix}tpnew  ·  ${prefix}tpsearch <keyword>`,
    `${prefix}epopular  ·  ${prefix}epnew  ·  ${prefix}epsearch <keyword>`,
    `${prefix}bcpopular  ·  ${prefix}bcnew  ·  ${prefix}bcsearch <keyword>`,
    '',
    'EXAMPLES',
    `${prefix}tpneon ABIX-AE`,
    `${prefix}epmagic ABIX-AE`,
    `${prefix}bdfireworks HAPPY BIRTHDAY JALAL`,
    `${prefix}epdeadpool SMALL TEXT | LARGE TEXT`,
    `${prefix}tpcouple NAME ONE | NAME TWO | EXTRA TEXT`,
    '',
    'Each listed template has its own separate command. Multi-field templates use | separators.',
  ].join('\n');
}

function listingText(title, templates, prefix, fallbackSite = 'textpro') {
  if (!templates.length) return `⚠️ ${title}: no results found.`;
  const lines = templates.map((template, index) => {
    const siteKey = resolveSiteKey(template.site || template.url) || fallbackSite;
    const main = siteMainCommand(siteKey);
    const command = template.command
      ? `${prefix}${template.command} ${template.inputs > 1 ? 'TEXT ONE | TEXT TWO' + (template.inputs === 3 ? ' | EXTRA TEXT' : '') : 'YOUR TEXT'}`
      : `${prefix}${main} ${template.url} | YOUR TEXT`;
    const multi = template.inputs > 1 ? ` (${template.inputs} text fields; separate with |)` : '';
    return `${index + 1}. ${template.title}${multi}\n   ${command}\n   ${template.url}`;
  });
  return [`⚡ ABIX // ${title}`, '━━━━━━━━━━━━━━━━━━', ...lines].join('\n\n');
}

function parseGenericRequest(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const pipe = input.indexOf('|');
  if (pipe >= 0) return { target: input.slice(0, pipe).trim(), text: input.slice(pipe + 1).trim() };
  const firstSpace = input.search(/\s/);
  if (firstSpace < 0) return { target: input, text: '' };
  return { target: input.slice(0, firstSpace).trim(), text: input.slice(firstSpace + 1).trim() };
}

async function generateAndSend(sock, message, args, context, templateInput) {
  const chatId = chatOf(message, context);
  if (!chatId) return;
  const template = typeof templateInput === 'string' ? resolveTemplate(templateInput) : templateInput;
  if (!template || !isAllowedEffectUrl(template.url)) {
    return sendText(sock, message, context, '❌ Unknown template. Try -tppopular, -epopular, -bcpopular, or the related site search command.');
  }

  const rawText = args.join(' ').trim();
  if (!rawText) {
    const siteKey = resolveSiteKey(template.site || template.url) || 'textpro';
    const mainCommand = siteMainCommand(siteKey);
    return sendText(sock, message, context,
      `✍️ Send text for: ${template.title}\n\nUsage: ${templateUsage(template, prefixOf(context))}\n` +
      (template.inputs > 1 ? `Separate ${template.inputs} text fields with |.` : `Example: ${prefixOf(context)}${template.command || mainCommand} YOUR TEXT`));
  }

  let texts;
  try {
    texts = splitTextFields(rawText, Number(template.inputs) || 1);
  } catch (error) {
    return sendText(sock, message, context, `⚠️ ${error.message}\nUsage: ${templateUsage(template, prefixOf(context))}`);
  }

  const identity = context?.senderId || message?.key?.participant || message?.key?.remoteJid || 'unknown';
  const loading = await sock.sendMessage(chatId, {
    text: `⚡ ABIX // RENDERING\nSite: ${SITE_CONFIGS[resolveSiteKey(template.site || template.url) || 'textpro'].label}\nTemplate: ${template.title}\nText: ${texts.join(' / ')}\n\n⏳ Connecting to generator...`,
  }, message ? { quoted: message } : undefined);

  try {
    if (typeof sock.sendPresenceUpdate === 'function') await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
    const result = await generateTextProImage(template, texts, `whatsapp:${identity}`);
    const siteKey = result.site || resolveSiteKey(template.site || template.url) || 'textpro';
    const caption = `⚡ ABIX // EFFECT LAB\n✦ Site: ${result.siteLabel || SITE_CONFIGS[siteKey].label}\n✦ Template: ${template.title}\n✦ Text: ${texts.join(' / ')}\n\nCreate another: ${prefixOf(context)}${template.command || siteMainCommand(siteKey)} YOUR TEXT\nSource: ${template.url}`;
    await sock.sendMessage(chatId, { image: result.buffer, caption }, message ? { quoted: message } : undefined);
  } catch (error) {
    const reason = safeText(error?.message || 'Unknown error', 260);
    await sock.sendMessage(chatId, { text: `⚠️ Effect generation failed\n${reason}` }, message ? { quoted: message } : undefined).catch(() => {});
  } finally {
    if (loading?.key?.id) await sock.sendMessage(chatId, { delete: loading.key }).catch(() => {});
  }
}

function createSiteDiscoveryPlugin(siteKey, group) {
  const site = SITE_CONFIGS[siteKey];
  const command = group === 'popular' ? site.popularCommand : site.newCommand;
  return {
    command,
    aliases: [],
    category: 'tools',
    cooldown: group === 'new' ? 7000 : 4000,
    description: `${group === 'popular' ? 'Popular' : 'Latest'} ${site.label} templates`,
    async handler(sock, message, args, context = {}) {
      let templates = SITE_GROUPS[siteKey][group].slice();
      if (group === 'new') {
        const status = await sock.sendMessage(chatOf(message, context), { text: `⏳ Checking ${site.label} for the latest templates...` }, message ? { quoted: message } : undefined);
        try {
          templates = await getLatestTemplates({ refresh: false, limit: 18, site: siteKey });
        } catch {
          templates = SITE_GROUPS[siteKey].new.slice();
        } finally {
          if (status?.key?.id) await sock.sendMessage(chatOf(message, context), { delete: status.key }).catch(() => {});
        }
      }
      return sendText(sock, message, context, listingText(`${site.label.toUpperCase()} ${group.toUpperCase()} TEMPLATES`, templates, prefixOf(context), siteKey));
    },
  };
}

function createSiteSearchPlugin(siteKey) {
  const site = SITE_CONFIGS[siteKey];
  return {
    command: site.searchCommand,
    aliases: [],
    category: 'tools',
    cooldown: 7000,
    description: `Search ${site.label} templates`,
    async handler(sock, message, args, context = {}) {
      const query = args.join(' ').trim();
      if (!query) return sendText(sock, message, context, `Usage: ${prefixOf(context)}${site.searchCommand} <keyword>\nExample: ${prefixOf(context)}${site.searchCommand} neon`);
      const chatId = chatOf(message, context);
      const loading = await sock.sendMessage(chatId, { text: `🔎 Searching ${site.label} for “${safeText(query, 80)}”...` }, message ? { quoted: message } : undefined);
      try {
        const found = await searchTextPro(query, 15, siteKey);
        await sock.sendMessage(chatId, { text: listingText(`${site.label.toUpperCase()} SEARCH: ${safeText(query, 70)}`, found, prefixOf(context), siteKey) }, message ? { quoted: message } : undefined);
      } catch (error) {
        await sock.sendMessage(chatId, { text: `⚠️ Search failed: ${safeText(error.message, 200)}` }, message ? { quoted: message } : undefined);
      } finally {
        if (loading?.key?.id) await sock.sendMessage(chatId, { delete: loading.key }).catch(() => {});
      }
    },
  };
}

// Export the Ephoto entrypoint as a helper so the existing plugins/textmaker.js
// command can preserve its legacy `-ephoto <legacy-style> <text>` path while
// becoming the sole registered `ephoto` command in the WhatsApp command registry.
const ephotoSitePlugin = {
  command: 'ephoto', aliases: ['ephoto360', 'ep'], category: 'tools', cooldown: 4000,
  description: 'Open Ephoto360 English effect menu',
  async handler(sock, message, args, context = {}) {
    const raw = args.join(' ').trim();
    if (!raw) return sendText(sock, message, context, siteHelp('ephoto', prefixOf(context)));
    const request = parseGenericRequest(raw);
    const template = resolveTemplate(request?.target);
    if (!template || resolveSiteKey(template.site || template.url) !== 'ephoto') return sendText(sock, message, context, '❌ Use an Ephoto360 command or template key. Try -epopular or -epsearch neon.');
    return generateAndSend(sock, message, request.text ? [request.text] : [], context, template);
  },
};

const plugins = [
  {
    command: 'textpro', aliases: ['tp', 'textfx'], category: 'tools', cooldown: 4000,
    description: 'Open multi-site text effect generator help',
    async handler(sock, message, args, context = {}) {
      const raw = args.join(' ').trim();
      if (!raw) return sendText(sock, message, context, helpText(prefixOf(context)));
      const request = parseGenericRequest(raw);
      if (!request) return sendText(sock, message, context, helpText(prefixOf(context)));
      const template = resolveTemplate(request.target);
      if (!template) return sendText(sock, message, context, '❌ Template not found. Try a template command, site command, or a supported effect URL.\n\n' + helpText(prefixOf(context)));
      return generateAndSend(sock, message, request.text ? [request.text] : [], context, template);
    },
  },
  {
    command: 'birthdaycake', aliases: ['birthday', 'bcake'], category: 'tools', cooldown: 4000,
    description: 'Open BirthdayCake24 effect menu',
    async handler(sock, message, args, context = {}) {
      const raw = args.join(' ').trim();
      if (!raw) return sendText(sock, message, context, siteHelp('birthdaycake', prefixOf(context)));
      const request = parseGenericRequest(raw);
      const template = resolveTemplate(request?.target);
      if (!template || resolveSiteKey(template.site || template.url) !== 'birthdaycake') return sendText(sock, message, context, '❌ Use a BirthdayCake24 command or template key. Try -bcpopular or -bcsearch cake.');
      return generateAndSend(sock, message, request.text ? [request.text] : [], context, template);
    },
  },
  {
    command: 'tppopular', aliases: ['tptrending', 'tpfav'], category: 'tools', cooldown: 4000,
    description: 'List popular TextPro templates',
    async handler(sock, message, args, context = {}) {
      return sendText(sock, message, context, listingText('TEXTPRO POPULAR TEMPLATES', POPULAR_TEMPLATES, prefixOf(context), 'textpro'));
    },
  },
  {
    command: 'tpnew', aliases: ['tplatest', 'tpfresh'], category: 'tools', cooldown: 7000,
    description: 'Show latest TextPro templates',
    async handler(sock, message, args, context = {}) {
      const status = await sock.sendMessage(chatOf(message, context), { text: '⏳ Checking TextPro for the latest templates...' }, message ? { quoted: message } : undefined);
      try {
        const templates = await getLatestTemplates({ refresh: false, limit: 18, site: 'textpro' });
        await sock.sendMessage(chatOf(message, context), { text: listingText('TEXTPRO NEW / LATEST TEMPLATES', templates, prefixOf(context), 'textpro') }, message ? { quoted: message } : undefined);
      } catch (error) {
        await sock.sendMessage(chatOf(message, context), { text: `⚠️ Latest templates unavailable: ${safeText(error.message, 200)}` }, message ? { quoted: message } : undefined);
      } finally {
        if (status?.key?.id) await sock.sendMessage(chatOf(message, context), { delete: status.key }).catch(() => {});
      }
    },
  },
  {
    command: 'tpsearch', aliases: ['tps', 'tpfind'], category: 'tools', cooldown: 7000,
    description: 'Search TextPro templates',
    async handler(sock, message, args, context = {}) {
      const query = args.join(' ').trim();
      if (!query) return sendText(sock, message, context, `Usage: ${prefixOf(context)}tpsearch <keyword>`);
      const loading = await sock.sendMessage(chatOf(message, context), { text: `🔎 Searching TextPro for “${safeText(query, 80)}”...` }, message ? { quoted: message } : undefined);
      try {
        const found = await searchTextPro(query, 15, 'textpro');
        await sock.sendMessage(chatOf(message, context), { text: listingText(`TEXTPRO SEARCH: ${safeText(query, 70)}`, found, prefixOf(context), 'textpro') }, message ? { quoted: message } : undefined);
      } catch (error) {
        await sock.sendMessage(chatOf(message, context), { text: `⚠️ Search failed: ${safeText(error.message, 200)}` }, message ? { quoted: message } : undefined);
      } finally {
        if (loading?.key?.id) await sock.sendMessage(chatOf(message, context), { delete: loading.key }).catch(() => {});
      }
    },
  },
  {
    command: 'tpcategories', aliases: ['tpcat'], category: 'tools', cooldown: 4000,
    description: 'Show TextPro categories',
    async handler(sock, message, args, context = {}) {
      return sendText(sock, message, context, `⚡ ABIX // TEXTPRO CATEGORIES\n━━━━━━━━━━━━━━━━━━\n${SITE_CONFIGS.textpro.categories.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nUse ${prefixOf(context)}tpsearch <keyword> to find effects.`);
    },
  },
];

for (const siteKey of ['ephoto', 'birthdaycake']) {
  plugins.push(createSiteDiscoveryPlugin(siteKey, 'popular'));
  plugins.push(createSiteDiscoveryPlugin(siteKey, 'new'));
  plugins.push(createSiteSearchPlugin(siteKey));
  const site = SITE_CONFIGS[siteKey];
  plugins.push({
    command: siteKey === 'ephoto' ? 'epcategories' : 'bccategories',
    aliases: [], category: 'tools', cooldown: 4000,
    description: `List ${site.label} categories`,
    async handler(sock, message, args, context = {}) {
      return sendText(sock, message, context, `⚡ ABIX // ${site.label.toUpperCase()} CATEGORIES\n━━━━━━━━━━━━━━━━━━\n${site.categories.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n\nUse ${prefixOf(context)}${site.searchCommand} <keyword> to find effects.`);
    },
  });
}

for (const template of ALL_TEMPLATES) {
  plugins.push({
    command: template.command,
    aliases: [],
    category: 'tools',
    cooldown: 7000,
    description: `Generate ${template.title}`,
    async handler(sock, message, args, context = {}) {
      return generateAndSend(sock, message, args, context, template);
    },
  });
}

module.exports = plugins;
module.exports.ephotoSitePlugin = ephotoSitePlugin;
