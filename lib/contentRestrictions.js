'use strict';

// Central fail-closed policy for adult commands and sources.
// Used before dispatch, by legacy command wrappers, and by URL/downloader gates.
const BLOCKED_ADULT_COMMANDS = new Set([
  'nsfw', 'hentai', 'porn', 'pornhub', 'xvideos', 'xvideo', 'xnxx', 'redgifs',
  'eporner', 'erome', 'tnaflix', 'youporn', 'redtube', 'nekonsfw', 'neko-nsfw',
  'nsfwneko', 'pppv', 'ppxvideos', 'ppxvideo', 'ppxnxx', 'ppxnxxsearch',
  'pppornhub', 'ppph', 'ppredgifs', 'pprgifs', 'ppeporner', 'ppeporn',
  'pperome', 'pprome', 'pptnaflix', 'pptf', 'ppyouporn', 'ppyp', 'ppredtube',
  'pprt', 'naddadultsearch', 'naddadulttrending', 'naddadultvideo',
  'naddadultsources', 'ppdiagnostics',
]);

const BLOCKED_ADULT_COMMAND_PREFIXES = ['naddadult'];
const BLOCKED_ADULT_TERMS = new Set([
  'nsfw', 'hentai', 'porn', 'pornhub', 'xvideos', 'xvideo', 'xnxx', 'xhamster',
  'redgifs', 'eporner', 'erome', 'tnaflix', 'youporn', 'redtube', 'brazzers',
  'ero', 'ecchi', 'oppai', 'milf', 'paizuri', 'oral', 'anal', 'explicit', 'nude', 'nudity', 'lewd',
  'adult', 'naked', 'nudes', 'sexual', 'sex', 'erotic', 'erotica', 'fetish', 'bdsm', 'blowjob',
  'handjob', 'cumshot', 'orgasm', 'masturbation', 'threesome', 'incest', 'boobs',
  'nipples', 'genitals', 'vagina', 'penis', 'dick', 'cock', 'pussy', 'rape', 'xxx',
  'hanime', 'rule34', 'hentaihaven', 'hentaimama', 'hentaidude', 'hentaiyes',
  'nhentai', 'hitomi', 'luscious', 'tsumino', 'pururin', '8muses', 'fakku',
  'hentaifox', 'asmhentai', 'realbooru', 'gelbooru', 'yande', 'xbooru', 'hypnohub',
]);

const BLOCKED_ADULT_DOMAINS = Object.freeze([
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'xhamster2.com',
  'youporn.com', 'redtube.com', 'tube8.com', 'spankbang.com', 'eporner.com',
  'beeg.com', 'tnaflix.com', 'thumbzilla.com', 'porntrex.com', 'hqporner.com',
  'drtuber.com', 'motherless.com', 'youjizz.com', 'vporn.com', 'brazzers.com',
  'redgifs.com', 'erome.com', 'hentaihaven.xxx', 'hentaimama.io',
  'uncensoredhentai.xxx', 'hentaiworld.tv', 'hentaiestream.com', 'hentaigasm.com',
  'animeidhentai.com', 'muchohentai.com', 'kuroani.me', 'hentaidude.com',
  'hentaiyes.com', 'rule34video.com', 'multporno.com', '3dhentai.net',
  'sfmcompile.club', '3dporn.com', '3dporndude.com', 'bignsfw.com', 'toonporn.com',
  'hentaizone.com', 'nhentai.net', 'hitomi.la', 'luscious.net', 'hentai2read.com',
  'tsumino.com', 'pururin.to', 'e-hentai.org', 'e-hentai.org', '8muses.com',
  'fakku.net', 'hentaifox.com', 'asmhentai.com', 'realbooru.com', 'gelbooru.com',
  'rule34.xxx', 'konachan.com.de', 'e621.net', 'sankakucomplex.com', 'yande.re',
  'xbooru.com', 'danbooru.donmai.us', 'paheal.net', 'tbib.org', 'hentai-foundry.com',
  'booru.org', 'hypnohub.net', 'nijie.info', 'adultcolony-api.vercel.app',
  'onlyfans.com', 'fansly.com', 'manyvids.com', 'chaturbate.com', 'stripchat.com',
  'livejasmin.com', 'bongacams.com', 'cam4.com', 'hanime.tv', 'hentaicloud.com',
  'hentaivideoworld.com', 'comicporn.xxx', 'cartoontube.xxx', 'simpsonsporn.com',
  'familyguyporn.com', 'hentaihand.com', 'multporn.net', 'fck-cl21.tnaflix.com',
]);

const BLOCKED_DIRECT_TARGETS = new Set([
  ...BLOCKED_ADULT_TERMS,
  // Derive aliases from every blocked host so selectors such as --site=e621,
  // --provider=onlyfans, and --target=nhentai are blocked before scraping.
  ...BLOCKED_ADULT_DOMAINS.map(domain => domain.split('.')[0].replace(/[^a-z0-9]/g, '')),
  ...BLOCKED_ADULT_DOMAINS.map(domain => domain.replace(/[^a-z0-9]/g, '')),
]);
const BLOCKED_ADULT_COMMAND_ROOTS = new Set([
  ...BLOCKED_DIRECT_TARGETS,
  'adult', 'nsfw', 'hentai', 'porn', 'xxx', 'rule34', 'ecchi', 'erotic',
].map(value => String(value).replace(/[^a-z0-9]/g, '')).filter(Boolean));
const BLOCKED_ADULT_COMMAND_SUFFIXES = [
  'search', 'find', 'lookup', 'download', 'downloader', 'dl', 'list', 'sources',
  'source', 'menu', 'random', 'trending', 'latest', 'video', 'videos', 'image',
  'images', 'gif', 'gifs', 'mode', 'enable', 'disable', 'on', 'off', 'feed',
  'explore', 'browse', 'get', 'info', 'catalog', 'catalogue', 'api', 'test',
];
const SAFE_DIRECT_TARGETS = new Set(['zerochan', 'moegirl', 'anime_pictures', 'seiga_nicovideo']);
const SAFE_DIRECT_HOSTS = new Set(['www.zerochan.net', 'zh.moegirl.org.cn', 'anime-pictures.net', 'seiga.nicovideo.jp']);
const BLOCKED_NEKO_TAGS = new Set([
  'ero', 'ecchi', 'oppai', 'hentai', 'milf', 'ass', 'paizuri', 'oral', 'nsfw',
  'explicit', 'nude', 'nudity', 'sex', 'porn', 'rule34',
]);

function normalizeCommand(value) {
  return String(value || '').trim().toLowerCase().replace(/^[/!.$-]+/, '').split(/[\s@]/, 1)[0];
}

function isBlockedAdultCommand(command) {
  const key = normalizeCommand(command);
  if (!key) return false;
  const flat = key.replace(/[^a-z0-9]/g, '');
  if (BLOCKED_ADULT_COMMANDS.has(key) || BLOCKED_ADULT_COMMANDS.has(flat)) return true;
  if (BLOCKED_ADULT_COMMAND_PREFIXES.some(prefix => flat.startsWith(prefix.replace(/[^a-z0-9]/g, '')))) return true;

  // Block legacy aliases and verb variants as well as the exact old names.
  // Only recognized suffixes are accepted, avoiding loose substring matches.
  let candidate = flat.replace(/^(?:pp|nadd)/, '');
  if (BLOCKED_ADULT_COMMAND_ROOTS.has(candidate)) return true;
  for (const root of BLOCKED_ADULT_COMMAND_ROOTS) {
    if (candidate.startsWith(root) && BLOCKED_ADULT_COMMAND_SUFFIXES.includes(candidate.slice(root.length))) return true;
  }
  return false;
}

function hostIsBlocked(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return BLOCKED_ADULT_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isBlockedAdultUrl(value) {
  const input = String(value || '');
  const matches = input.match(/https?:\/\/[^\s<>()\[\]{}"']+/ig) || [];
  for (const candidate of matches) {
    try { if (hostIsBlocked(new URL(candidate.replace(/[),.;!?]+$/, '')).hostname)) return true; } catch {}
  }
  // Also block bare domain references that a legacy parser might resolve itself.
  const lower = input.toLowerCase();
  return BLOCKED_ADULT_DOMAINS.some(domain => new RegExp(`(^|[^a-z0-9.-])(?:[a-z0-9-]+\\.)*${domain.replaceAll('.', '\\.')}(?=($|[^a-z0-9.-]))`, 'i').test(lower));
}

function hasBlockedAdultTargetSelector(value) {
  const input = String(value || '');
  const patterns = [
    /(?:^|\s)--?(?:site|target|provider|source)\s*=\s*([^\s]+)/ig,
    /(?:^|\s)--?(?:site|target|provider|source)\s+([^\s]+)/ig,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(input))) {
      const target = normalizeCommand(m[1]).replace(/[^a-z0-9]+/g, '');
      if (BLOCKED_DIRECT_TARGETS.has(target) || isBlockedAdultCommand(target) || hostIsBlocked(target)) return true;
      if (BLOCKED_ADULT_DOMAINS.some(domain => target.includes(domain.replaceAll('.', '')))) return true;
    }
  }
  return false;
}

function containsBlockedAdultSiteReference(value) {
  const input = String(value || '').toLowerCase();
  if (isBlockedAdultUrl(input)) return true;
  const tokens = input.split(/[^a-z0-9._-]+/).filter(Boolean).map(s => s.replace(/[^a-z0-9]/g, ''));
  return tokens.some(token => BLOCKED_DIRECT_TARGETS.has(token));
}

function isBlockedAdultRequest(command, argumentsText = '') {
  const key = normalizeCommand(command);
  if (isBlockedAdultCommand(key)) return true;
  if (hasBlockedAdultTargetSelector(argumentsText) || containsBlockedAdultSiteReference(argumentsText)) return true;
  if (['neko', 'waifu', 'nekopic', 'nimg'].includes(key)) {
    const first = String(argumentsText || '').trim().toLowerCase().split(/\s+/)[0] || '';
    if (BLOCKED_NEKO_TAGS.has(first)) return true;
    if (/\b(?:nsfw|hentai|porn|rule34|explicit|nude|nudity)\b/i.test(argumentsText)) return true;
  }
  return false;
}

function isAllowedDirectTarget(target) {
  const id = String(target?.id || target?.key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  let host = '';
  try { host = new URL(target?.baseUrl || target?.url || '').hostname.toLowerCase(); } catch {}
  return SAFE_DIRECT_TARGETS.has(id) && SAFE_DIRECT_HOSTS.has(host) && !isBlockedAdultUrl(target?.baseUrl || target?.url || '');
}

module.exports = {
  BLOCKED_ADULT_COMMANDS,
  BLOCKED_ADULT_DOMAINS,
  BLOCKED_NEKO_TAGS,
  isBlockedAdultCommand,
  isBlockedAdultUrl,
  hasBlockedAdultTargetSelector,
  containsBlockedAdultSiteReference,
  isBlockedAdultRequest,
  isAllowedDirectTarget,
  hostIsBlocked,
};
