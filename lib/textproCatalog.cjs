'use strict';

const SITE_CONFIGS = Object.freeze({
  textpro: Object.freeze({
    key: 'textpro', label: 'TextPro.me', shortLabel: 'TextPro',
    baseUrl: 'https://textpro.me', latestUrl: 'https://textpro.me/', latestHeading: 'New',
    searchCommand: 'tpsearch', popularCommand: 'tppopular', newCommand: 'tpnew',
    categories: ['Light Style', 'Metallic Style', 'Misc Style', 'Food Style Text Effect', 'Deluxe Text Effect', '3D Text Effect', 'Tech Style', 'Graffiti Style', 'Christmas', 'Happy New Year'],
  }),
  ephoto: Object.freeze({
    key: 'ephoto', label: 'Ephoto360 English', shortLabel: 'Ephoto360',
    baseUrl: 'https://en.ephoto360.com', latestUrl: 'https://en.ephoto360.com/', latestHeading: 'New update',
    searchCommand: 'epsearch', popularCommand: 'epopular', newCommand: 'epnew',
    categories: ['Text effects', '3D Effect', 'Love', 'Artistic effect', 'Technology', 'Glass Effect', 'Fire effects', 'Happy Birthday', 'Animations', 'Photo effects'],
  }),
  birthdaycake: Object.freeze({
    key: 'birthdaycake', label: 'BirthdayCake24', shortLabel: 'BirthdayCake24',
    baseUrl: 'https://birthdaycake24.com', latestUrl: 'https://birthdaycake24.com/name-birthday-cakes-c20', latestHeading: 'New',
    searchCommand: 'bcsearch', popularCommand: 'bcpopular', newCommand: 'bcnew',
    categories: ['Birthday cakes with name', 'Birthday greeting cards', 'Birthday photo frames', 'Birthday cakes with photos', 'Funny birthday cards', 'Birthday wishes'],
  }),
});

const POPULAR_TEMPLATES = Object.freeze([
  { key: 'neon', command: 'tpneon', title: 'Neon Light Text Effect', url: 'https://textpro.me/neon-light-text-effect-online-882.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'greenneon', command: 'tpgreenneon', title: 'Green Neon Text Effect', url: 'https://textpro.me/green-neon-text-effect-free-online-glowing-text-generator-874.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'glitch', command: 'tpglitch', title: 'Glitch / TikTok Text Effect', url: 'https://textpro.me/create-glitch-text-effect-style-tik-tok-983.html', inputs: 2, group: 'popular', site: 'textpro' },
  { key: 'thunder', command: 'tpthunder', title: 'Thunder Text Effect', url: 'https://textpro.me/create-thunder-text-effect-online-881.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'glow', command: 'tpglow', title: 'Advanced Glow Text Effect', url: 'https://textpro.me/free-advanced-glow-text-effect-873.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'matrix', command: 'tpmatrix', title: 'Matrix Style Text Effect', url: 'https://textpro.me/matrix-style-text-effect-online-884.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'gold', command: 'tpgold', title: 'Deluxe Gold Text Effect', url: 'https://textpro.me/deluxe-gold-text-effect-966.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'lava', command: 'tplava', title: 'Lava Text Effect', url: 'https://textpro.me/lava-text-effect-online-914.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'metallic', command: 'tpmetallic', title: 'Metallic Text Effect', url: 'https://textpro.me/create-a-metallic-text-effect-free-online-1041.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: '3dneon', command: 'tp3dneon', title: '3D Neon Light Text Effect', url: 'https://textpro.me/create-3d-neon-light-text-effect-online-1028.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'wood', command: 'tpwood', title: 'Wood Text Effect', url: 'https://textpro.me/wood-text-effect-856.html', inputs: 1, group: 'popular', site: 'textpro' },
  { key: 'blackmetal', command: 'tpblackmetal', title: 'Black Metal Text Effect', url: 'https://textpro.me/black-metal-text-effect-829.html', inputs: 1, group: 'popular', site: 'textpro' },
]);

const NEW_TEMPLATES = Object.freeze([
  { key: 'couple', command: 'tpcouple', title: 'Couple Name Typography (3 texts)', url: 'https://textpro.me/couple-name-typography-effect-on-minimalist-romantic-holding-hands-line-art-1193.html', inputs: 3, group: 'new', site: 'textpro' },
  { key: 'candy', command: 'tpcandy', title: 'Cute 3D Candy Text Effect', url: 'https://textpro.me/online-cute-3d-candy-text-effect-generator-1192.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'crystal', command: 'tpcrystal', title: 'Sparkling Colored Crystal Text Effect', url: 'https://textpro.me/luxurious-and-creative-sparkling-colored-crystal-text-effect-1190.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'chrome', command: 'tpchrome', title: 'Glossy Metallic Chrome 3D Text', url: 'https://textpro.me/glossy-metallic-chrome-3d-text-effect-1185.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'mysticalpink', command: 'tpmysticalpink', title: 'Mystical Neon Pink Logo Effect', url: 'https://textpro.me/create-a-mystical-neon-blackpink-logo-text-effect-1180.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'iceblue', command: 'tpiceblue', title: '3D Cold Blue Metallic Text', url: 'https://textpro.me/create-3d-cold-blue-metallic-text-effects-online-1179.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'corn', command: 'tpcorn', title: 'Artistic 3D Corn Kernel Text', url: 'https://textpro.me/create-artistic-3d-text-effects-from-corn-kernels-1177.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'bluemarble', command: 'tpbluemarble', title: 'Luxurious Blue Marble Text', url: 'https://textpro.me/create-a-luxurious-blue-marble-text-effect-1176.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'pearl', command: 'tppearl', title: 'Elegant 3D Pearl Text', url: 'https://textpro.me/create-elegant-3d-pearl-text-effects-online-1168.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'hologram', command: 'tphologram', title: '3D Hologram Glass Text', url: 'https://textpro.me/create-online-3d-hologram-glass-text-effect-1163.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'deadpool', command: 'tpdeadpool', title: 'Deadpool Logo Style Text', url: 'https://textpro.me/create-deadpool-logo-style-text-effect-online-1159.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'reflected', command: 'tpreflected', title: 'Reflected Neon Text Effect', url: 'https://textpro.me/create-online-reflected-neon-text-effect-1157.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'thunder3d', command: 'tpthunder3d', title: '3D Thunder Text Effect', url: 'https://textpro.me/create-3d-thunder-text-effects-online-1147.html', inputs: 1, group: 'new', site: 'textpro' },
  { key: 'liquidmetal', command: 'tpliquidmetal', title: '3D Liquid Metal Text', url: 'https://textpro.me/create-3d-liquid-metal-text-effect-1112.html', inputs: 1, group: 'new', site: 'textpro' },
]);

// Ephoto360 URLs were selected from public English-domain effect pages. These
// are text-only presets; image-upload/crop-only effects are deliberately omitted.
const EPHOTO_POPULAR_TEMPLATES = Object.freeze([
  { key: 'epmagic', command: 'epmagic', title: 'Magic Purple Text Effect', url: 'https://en.ephoto360.com/magic-text-effect-278.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'epbokeh', command: 'epbokeh', title: 'Bokeh Text Effect', url: 'https://en.ephoto360.com/bokeh-text-effect-86.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'epcolor', command: 'epcolor', title: 'Color Text Effects', url: 'https://en.ephoto360.com/color-text-effects-160.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'epcloud', command: 'epcloud', title: 'Realistic Cloud Text', url: 'https://en.ephoto360.com/create-realistic-cloud-text-effect-606.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'eppapercut', command: 'eppapercut', title: 'Art Paper-Cut Text', url: 'https://en.ephoto360.com/free-online-art-paper-cut-text-effects-695.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'epname', command: 'epname', title: 'Create Text by Name', url: 'https://en.ephoto360.com/create-text-by-name-effect-58.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'eppavement', command: 'eppavement', title: 'Typography on Pavement', url: 'https://en.ephoto360.com/create-typography-text-effect-on-pavement-online-774.html', inputs: 1, group: 'popular', site: 'ephoto' },
  { key: 'epretro', command: 'epretro', title: 'Retro Neon Text (3 lines)', url: 'https://en.ephoto360.com/free-retro-neon-text-effect-online-538.html', inputs: 3, group: 'popular', site: 'ephoto' },
]);

const EPHOTO_NEW_TEMPLATES = Object.freeze([
  { key: 'epdeadpool', command: 'epdeadpool', title: 'Deadpool Logo Text (2 fields)', url: 'https://en.ephoto360.com/create-text-effects-in-the-style-of-the-deadpool-logo-818.html', inputs: 2, group: 'new', site: 'ephoto' },
  { key: 'epcomic', command: 'epcomic', title: '3D Comic Text', url: 'https://en.ephoto360.com/create-online-3d-comic-style-text-effects-817.html', inputs: 1, group: 'new', site: 'ephoto' },
  { key: 'epdragonball', command: 'epdragonball', title: 'Dragon Ball Text', url: 'https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html', inputs: 1, group: 'new', site: 'ephoto' },
  { key: 'epblackpink', command: 'epblackpink', title: 'BLACKPINK Logo Text', url: 'https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html', inputs: 1, group: 'new', site: 'ephoto' },
  { key: 'epsilver', command: 'epsilver', title: 'Glossy Silver 3D Text', url: 'https://en.ephoto360.com/create-glossy-silver-3d-text-effect-online-802.html', inputs: 1, group: 'new', site: 'ephoto' },
  { key: 'epneon', command: 'epneon', title: 'Colorful Neon Light Text', url: 'https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html', inputs: 1, group: 'new', site: 'ephoto' },
]);

const BIRTHDAY_POPULAR_TEMPLATES = Object.freeze([
  { key: 'bdfireworks', command: 'bdfireworks', title: 'Birthday Fireworks Greeting', url: 'https://birthdaycake24.com/create-a-happy-birthday-firework-effect-with-name-891.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdbeauty', command: 'bdbeauty', title: 'Beautiful Birthday Cake with Name', url: 'https://birthdaycake24.com/beautiful-birthday-cake-with-name-857.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdwrite', command: 'bdwrite', title: 'Write Name on Birthday Cake', url: 'https://birthdaycake24.com/write-name-on-happy-birthday-online-839.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdtextcake', command: 'bdtextcake', title: 'Text Birthday Cake', url: 'https://birthdaycake24.com/text-birthday-cake-online-677.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdcake', command: 'bdcake', title: 'Birthday Cake with Name Edit', url: 'https://birthdaycake24.com/birthday-cake-with-name-edit-895.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdwishcake', command: 'bdwishcake', title: 'Birthday Cake Wishes', url: 'https://birthdaycake24.com/name-birthday-cake-write-wishes-on-birthday-cake-671.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
  { key: 'bdroses', command: 'bdroses', title: 'Birthday Cake Roses with Name', url: 'https://birthdaycake24.com/birthday-cake-roses-with-name-859.html', inputs: 1, group: 'popular', site: 'birthdaycake' },
]);

const BIRTHDAY_NEW_TEMPLATES = Object.freeze([
  { key: 'bdstrawberry', command: 'bdstrawberry', title: 'Romantic Strawberry Heart Cake', url: 'https://birthdaycake24.com/romantic-strawberry-heart-birthday-cake-image-with-your-name-2605.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdcustomcake', command: 'bdcustomcake', title: 'Strawberry Chocolate Birthday Cake', url: 'https://birthdaycake24.com/customize-strawberry-chocolate-happy-birthday-cake-with-name-editing-2983.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdorangrose', command: 'bdorangrose', title: 'Orange Rose Birthday Cake', url: 'https://birthdaycake24.com/create-orange-rose-birthday-cake-template-with-your-name-2638.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdcandles', command: 'bdcandles', title: 'Lovely Candles Birthday Cake', url: 'https://birthdaycake24.com/write-name-on-lovely-candles-birthday-cake-online-1837.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdsunflower', command: 'bdsunflower', title: 'Sunflowers Birthday Cake', url: 'https://birthdaycake24.com/happy-sunflowers-birthday-cake-with-name-1698.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdsister', command: 'bdsister', title: 'Birthday Wishes Card for Sister', url: 'https://birthdaycake24.com/lovely-birthday-wishes-cards-for-sister-with-name-2441.html', inputs: 1, group: 'new', site: 'birthdaycake' },
  { key: 'bdcrown', command: 'bdcrown', title: 'Birthday Cake with Crown', url: 'https://birthdaycake24.com/print-name-on-happy-birthday-cake-with-crown-for-friend-2024.html', inputs: 1, group: 'new', site: 'birthdaycake' },
]);

const SITE_CATALOGS = Object.freeze({
  textpro: Object.freeze({ popular: POPULAR_TEMPLATES, new: NEW_TEMPLATES }),
  ephoto: Object.freeze({ popular: EPHOTO_POPULAR_TEMPLATES, new: EPHOTO_NEW_TEMPLATES }),
  birthdaycake: Object.freeze({ popular: BIRTHDAY_POPULAR_TEMPLATES, new: BIRTHDAY_NEW_TEMPLATES }),
});

const ALL_TEMPLATES = Object.freeze([
  ...POPULAR_TEMPLATES, ...NEW_TEMPLATES,
  ...EPHOTO_POPULAR_TEMPLATES, ...EPHOTO_NEW_TEMPLATES,
  ...BIRTHDAY_POPULAR_TEMPLATES, ...BIRTHDAY_NEW_TEMPLATES,
]);
const byKey = new Map(ALL_TEMPLATES.map(item => [item.key, item]));
const byCommand = new Map(ALL_TEMPLATES.map(item => [item.command, item]));
const allowedHosts = new Set([
  'textpro.me', 'www.textpro.me',
  'en.ephoto360.com',
  'birthdaycake24.com', 'www.birthdaycake24.com',
]);

function safeText(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isAllowedEffectUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' && allowedHosts.has(u.hostname.toLowerCase()) && !u.username && !u.password;
  } catch {
    return false;
  }
}

function isAllowedTextProUrl(value) { return isAllowedEffectUrl(value); }

function siteKeyForUrl(value) {
  try {
    const host = new URL(String(value)).hostname.toLowerCase();
    if (host === 'textpro.me' || host === 'www.textpro.me') return 'textpro';
    if (host === 'en.ephoto360.com') return 'ephoto';
    if (host === 'birthdaycake24.com' || host === 'www.birthdaycake24.com') return 'birthdaycake';
  } catch {}
  return null;
}

function resolveSiteKey(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (SITE_CONFIGS[raw]) return raw;
  if (raw.includes('ephoto360')) return 'ephoto';
  if (raw.includes('birthdaycake24') || raw === 'birthday' || raw === 'birthday-cake') return 'birthdaycake';
  if (raw.includes('textpro')) return 'textpro';
  const urlSite = siteKeyForUrl(value);
  return urlSite || null;
}

function getSiteConfig(site) {
  const key = resolveSiteKey(site) || 'textpro';
  return SITE_CONFIGS[key];
}

function getSiteTemplates(site, group = 'all') {
  const key = resolveSiteKey(site) || 'textpro';
  const catalog = SITE_CATALOGS[key];
  if (group === 'all') return [...catalog.popular, ...catalog.new];
  if (group === 'latest' || group === 'new') return catalog.new.slice();
  if (group === 'popular' || group === 'trending') return catalog.popular.slice();
  return [];
}

function resolveTemplate(value) {
  const raw = safeText(value, 1000);
  if (!raw) return null;
  const normal = raw.toLowerCase().replace(/^\./, '').replace(/^\//, '').replace(/\s+/g, ' ').trim();
  if (byKey.has(normal)) return byKey.get(normal);
  if (byCommand.has(normal)) return byCommand.get(normal);
  const foundByTitle = ALL_TEMPLATES.find(item => item.title.toLowerCase() === normal);
  if (foundByTitle) return foundByTitle;
  if (isAllowedEffectUrl(raw)) {
    const candidate = new URL(raw);
    const known = ALL_TEMPLATES.find(item => item.url === candidate.href.replace(/\/$/, ''));
    if (known) return known;
    const slug = candidate.pathname.split('/').pop().replace(/\.html?$/i, '');
    return {
      key: slug.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'custom',
      title: slug.replace(/-\d+$/, '').replace(/-/g, ' '),
      url: candidate.href, inputs: 1, group: 'custom', site: siteKeyForUrl(candidate.href), command: null,
    };
  }
  return null;
}

function splitTextFields(raw, expectedInputs = 1) {
  const maxTextLength = Math.max(40, Math.min(1000, Number(process.env.TEXT_PRO_MAX_TEXT_LENGTH) || 240));
  const value = String(raw ?? '').trim();
  if (!value) return [];
  const expected = Math.max(1, Math.min(10, Number(expectedInputs) || 1));
  const pieces = expected > 1 ? value.split('|').map(part => safeText(part, maxTextLength)) : [safeText(value, maxTextLength)];
  if (pieces.length !== expected) {
    const error = new Error(`This template requires ${expected} text field(s). Separate each field with |. Example: ${expected === 3 ? 'NAME ONE | NAME TWO | EXTRA TEXT' : 'MAIN TEXT | SMALL TEXT'}`);
    error.code = 'TEXT_PRO_FIELD_COUNT';
    throw error;
  }
  if (pieces.some(part => !part)) {
    const error = new Error('Each text field must contain text. Separate fields with |.');
    error.code = 'TEXT_PRO_EMPTY_FIELD';
    throw error;
  }
  return pieces;
}

function templateUsage(template, prefix = '-') {
  if (!template.command) {
    const siteKey = resolveSiteKey(template.site || template.url) || 'textpro';
    const mainCommand = siteKey === 'ephoto' ? 'ephoto' : siteKey === 'birthdaycake' ? 'birthdaycake' : 'textpro';
    return `${prefix}${mainCommand} ${template.url} | YOUR TEXT`;
  }
  const command = template.command;
  const example = template.inputs > 1
    ? `${prefix}${command} TEXT ONE | TEXT TWO${template.inputs === 3 ? ' | EXTRA TEXT' : ''}`
    : `${prefix}${command} YOUR TEXT`;
  return example;
}

module.exports = {
  BASE_URL: SITE_CONFIGS.textpro.baseUrl,
  SITE_CONFIGS,
  SITE_CATALOGS,
  POPULAR_TEMPLATES,
  NEW_TEMPLATES,
  EPHOTO_POPULAR_TEMPLATES,
  EPHOTO_NEW_TEMPLATES,
  BIRTHDAY_POPULAR_TEMPLATES,
  BIRTHDAY_NEW_TEMPLATES,
  ALL_TEMPLATES,
  resolveTemplate,
  resolveSiteKey,
  getSiteConfig,
  getSiteTemplates,
  siteKeyForUrl,
  isAllowedEffectUrl,
  isAllowedTextProUrl,
  splitTextFields,
  templateUsage,
  safeText,
};
