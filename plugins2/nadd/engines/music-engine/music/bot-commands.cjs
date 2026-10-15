'use strict';
/**
 * Baileys WhatsApp bot plugin — Music Intelligence commands.
 * Prefix: `-` (NOT $). CommonJS.
 *
 * Drop-in usage:
 *   const music = require('./music/bot-commands.cjs');
 *   // inside your message handler:
 *   if (await music.handleMusicMessage(text, { reply, sender, audioBuffer, mime })) return;
 *
 * ctx = { reply: async (text) => {}, sender, audioBuffer (Buffer|null), mime, raw }
 */
const MusicManager = require('./music-manager');
const searchEngine = require('./search-engine');
const { formatDuration } = require('./html');

const PREFIX = '-';
const manager = new MusicManager();

function fmtDur(ms) {
  const s = formatDuration(ms);
  return s || '—';
}

function fmtTrack(r) {
  const m = r.match || {};
  const lines = [];
  lines.push('🎵 ' + (m.title || r.query || 'Unknown'));
  if (m.artist) lines.push('👤 Artist: ' + m.artist);
  if (m.album) lines.push('💿 Album: ' + m.album);
  if (m.releaseDate) lines.push('📅 Released: ' + m.releaseDate);
  if (m.durationMs) lines.push('⏱ Duration: ' + fmtDur(m.durationMs));
  if (r.metadata && r.metadata.language) lines.push('🌍 Language: ' + r.metadata.language);
  if (r.metadata && r.metadata.genre) lines.push('🎼 Genre: ' + r.metadata.genre);
  if (m.isrc) lines.push('🔖 ISRC: ' + m.isrc);
  lines.push('🔎 Match: ' + Math.round((m.confidence || 0) * 100) + '% (' + (m.band || 'uncertain') + ')');
  if (r.lyrics && r.lyrics.available) {
    lines.push('📜 Lyrics: Available via ' + (r.lyrics.provider || 'provider'));
    if (r.lyrics.url) lines.push('🔗 ' + r.lyrics.url);
    if (r.lyrics.excerpt) lines.push('“' + r.lyrics.excerpt + '”');
  } else {
    lines.push('📜 Lyrics: not found');
  }
  const links = r.musicLinks || {};
  const have = [];
  if (links.spotify) have.push('Spotify: ' + links.spotify);
  if (links.appleMusic) have.push('Apple Music: ' + links.appleMusic);
  if (links.youtube) have.push('YouTube: ' + links.youtube);
  if (links.deezer) have.push('Deezer: ' + links.deezer);
  if (links.soundcloud) have.push('SoundCloud: ' + links.soundcloud);
  if (have.length) { lines.push('🎧 Listen:'); for (const h of have) lines.push('  ' + h); }
  return lines.join('\n');
}

function fmtMultiple(found) {
  const lines = ['🎵 Multiple matches found', ''];
  (found.candidates || []).slice(0, 8).forEach((c, i) => {
    lines.push((i + 1) + '. ' + (c.candidate.title || '?') + ' — ' + (c.candidate.artist || '?') + ' (' + Math.round(c.confidence * 100) + '%)');
  });
  lines.push('', 'Reply with the number, or be more specific (add the artist).');
  return lines.join('\n');
}

const MUSIC_MENU =
  '🎵 MUSIC MENU\n\n' +
  '🔎 SEARCH\n' +
  '-song <query> | -songsearch | -musicsearch\n' +
  '-findsong "<lyric fragment>"\n\n' +
  '📜 LYRICS\n' +
  '-lyrics <song> | -pklyrics | -urdulyrics | -hindilyrics | -punjabilyrics\n\n' +
  '🎤 ARTIST\n' +
  '-artist <name> | -album <name> | -songinfo <song>\n\n' +
  '🧠 INFO\n' +
  '-songmeaning <song> | -songfacts <song> | -sampled <song>\n\n' +
  '🌍 TRANSLATION\n' +
  '-translate-song <song> | <language>\n\n' +
  '🔥 TRENDING\n' +
  '-trendingmusic [country] | -newmusic | -topmusic [country] | -chart [country]\n\n' +
  '🎧 IDENTIFICATION\n' +
  '-identify (reply to / send an audio clip)\n' +
  '-identifyvoice (reply to a voice note)\n\n' +
  'Tip: paste a Spotify / YouTube / Apple Music link after -song or -lyrics.';

async function needQuery(ctx, reply) {
  if (!ctx.query) { await reply('Give me a song to search. Example: -song Kahani Suno'); return false; }
  return true;
}

const commands = [
  {
    name: 'musicmenu', aliases: ['music', 'musichelp'], category: 'music',
    description: 'Show the music menu', usage: '-musicmenu',
    handler: async (ctx) => { await ctx.reply(MUSIC_MENU); },
  },
  {
    name: 'song', aliases: ['songsearch', 'musicsearch', 'songinfo'], category: 'music',
    description: 'Search a song with full metadata', usage: '-song <title> [artist]',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply('🔎 Searching…');
      const r = await manager.search(ctx.query, { lyrics: true });
      if (!r.match.title && r.candidates && r.candidates.length > 1) { await ctx.reply(fmtMultiple(r)); return; }
      if (!r.match.title) { await ctx.reply('❌ No match found for "' + ctx.query + '".'); return; }
      await ctx.reply(fmtTrack(r));
    },
  },
  {
    name: 'lyrics', aliases: ['lyric'], category: 'music',
    description: 'Find an authorized lyrics source for a song', usage: '-lyrics <song> [artist]',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply('🔎 Finding lyrics…');
      const r = await manager.search(ctx.query, { lyrics: true });
      if (!r.match.title) { await ctx.reply('❌ No match found for "' + ctx.query + '".'); return; }
      const L = r.lyrics || {};
      let msg = '🎵 ' + r.match.title + '\n👤 ' + r.match.artist + '\n\n';
      if (L.available) {
        msg += '📜 Lyrics available via ' + (L.provider || 'provider') + '\n';
        if (L.url) msg += '🔗 ' + L.url + '\n';
        if (L.excerpt) msg += '\n“' + L.excerpt + '”';
        msg += '\n\nFull lyrics open at the link above (respects the provider’s license).';
      } else {
        msg += '📜 No licensed lyrics source found right now.';
      }
      await ctx.reply(msg);
    },
  },
  {
    name: 'findsong', aliases: ['find'], category: 'music',
    description: 'Find a song from a lyrics fragment', usage: '-findsong "hello from the other side"',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply('🔎 Matching lyric fragment…');
      const found = await searchEngine.searchByLyricsFragment(ctx.query);
      if (!found.candidates.length) { await ctx.reply('❌ No songs matched that fragment.'); return; }
      const lines = ['🔎 Possible matches:', ''];
      found.candidates.slice(0, 5).forEach((c, i) => {
        lines.push((i + 1) + '. ' + (c.candidate.title || '?') + ' — ' + (c.candidate.artist || '?'));
        lines.push('   Match: ' + Math.round(c.confidence * 100) + '%');
      });
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'artist', aliases: [], category: 'music',
    description: 'Artist info: popular songs, albums, links', usage: '-artist <name>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply('🔎 Looking up artist…');
      const a = await manager.getArtist(ctx.query);
      const lines = ['🎤 ' + (a.name || ctx.query), ''];
      if (a.country) lines.push('🌍 ' + a.country);
      if (a.genres && a.genres.length) lines.push('🎼 ' + a.genres.slice(0, 5).join(', '));
      lines.push('', 'Popular Songs:');
      (a.popularTracks || []).slice(0, 8).forEach((t, i) => lines.push((i + 1) + '. ' + t.title));
      if (a.albums && a.albums.length) { lines.push('', 'Albums:'); a.albums.slice(0, 5).forEach((al) => lines.push('• ' + (al.title || al))); }
      const urls = a.urls || {};
      const keys = Object.keys(urls);
      if (keys.length) { lines.push('', 'Top Platforms:'); keys.slice(0, 5).forEach((k) => lines.push('• ' + k + ': ' + urls[k])); }
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'album', aliases: [], category: 'music',
    description: 'Album info with track list', usage: '-album <name>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply('🔎 Looking up album…');
      const a = await manager.getAlbum(ctx.query);
      if (a.notFound) { await ctx.reply('❌ Album not found: "' + ctx.query + '"'); return; }
      const lines = ['💿 ' + a.title, '👤 ' + (a.artist || '—')];
      if (a.releaseDate) lines.push('📅 ' + a.releaseDate);
      if (a.genre) lines.push('🎼 ' + a.genre);
      if (a.label) lines.push('🏷 ' + a.label);
      lines.push('', 'Tracks (' + (a.trackCount || (a.tracks || []).length) + '):');
      (a.tracks || []).slice(0, 20).forEach((t, i) => lines.push((i + 1) + '. ' + (t.title || t)));
      if (a.url) lines.push('\n🔗 ' + a.url);
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'songmeaning', aliases: ['meaning'], category: 'music',
    description: 'Song meaning / interpretation (sourced)', usage: '-songmeaning <song>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      const m = await manager.getMeaning(ctx.query);
      if (!m.available && !m.sources.length) { await ctx.reply('❌ No meaning/interpretation found for "' + ctx.query + '".'); return; }
      let msg = '🧠 Meaning — ' + ctx.query + '\n\n';
      if (m.summary) msg += m.summary + '\n\n';
      msg += 'Sources:\n' + m.sources.slice(0, 4).map((s) => '• ' + s.provider + (s.url ? ': ' + s.url : '')).join('\n');
      msg += '\n\n_Interpretations are community/official annotations, not always the artist’s own words._';
      await ctx.reply(msg);
    },
  },
  {
    name: 'songfacts', aliases: ['facts'], category: 'music',
    description: 'Song facts: writers, release, charts, awards', usage: '-songfacts <song>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      const f = await manager.getFacts(ctx.query);
      const lines = ['📖 Song facts — ' + ctx.query, ''];
      const facts = f.facts || {};
      const labels = { releaseDate: '📅 Released', year: '📅 Year', writers: '✍ Writers', producers: '🎚 Producers', label: '🏷 Label', genre: '🎼 Genre', album: '💿 Album' };
      for (const k of Object.keys(labels)) {
        if (facts[k]) lines.push(labels[k] + ': ' + (Array.isArray(facts[k]) ? facts[k].join(', ') : facts[k]));
      }
      if (!lines.length || lines.length === 2) lines.push('No facts found.');
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'sampled', aliases: ['samples', 'interpolation'], category: 'music',
    description: 'Samples / interpolations relationships', usage: '-sampled <song>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      const s = await manager.getSamples(ctx.query);
      if (!s.relationships.length) { await ctx.reply('No sample/interpolation relationships found for "' + ctx.query + '".'); return; }
      const lines = ['🔁 Samples & interpolations — ' + ctx.query, ''];
      s.relationships.slice(0, 10).forEach((r) => lines.push('• ' + (r.title || r.description || JSON.stringify(r))));
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'translate-song', aliases: ['translatesong'], category: 'music',
    description: 'Find an authorized translation', usage: '-translate-song <song> | <language>',
    handler: async (ctx) => {
      const parts = ctx.query.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) { await ctx.reply('Usage: -translate-song Perfect | Urdu'); return; }
      const r = await manager.search(parts[0], { lyrics: true });
      if (!r.match.title) { await ctx.reply('❌ No match found for "' + parts[0] + '".'); return; }
      const trs = await manager.findTranslations({ title: r.match.title, artist: r.match.artist }, parts[1]);
      if (!trs.length) { await ctx.reply('No authorized ' + parts[1] + ' translation found for "' + r.match.title + '".'); return; }
      const lines = ['🌍 Translations — ' + r.match.title + ' → ' + parts[1], ''];
      trs.slice(0, 5).forEach((t) => {
        lines.push('• ' + t.provider + (t.url ? ': ' + t.url : '') + (t.summary ? '\n  ' + t.summary.slice(0, 200) : ''));
      });
      lines.push('\n_Full translations open at the provider link (license-respecting). No unauthorized full copies are generated._');
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'trendingmusic', aliases: ['trending'], category: 'music',
    description: 'Trending music by country', usage: '-trendingmusic [pk|in|us|uk|...]',
    handler: async (ctx) => {
      const country = (ctx.args[0] || 'global').toLowerCase();
      await ctx.reply('🔥 Fetching trending music (' + country.toUpperCase() + ')…');
      const t = await manager.getTrending(country === 'global' ? undefined : country);
      const lines = ['🔥 ' + (country === 'global' ? 'GLOBAL' : country.toUpperCase()) + ' MUSIC TRENDING', ''];
      t.trending.slice(0, 15).forEach((e) => lines.push(e.trendRank + '. ' + e.title + ' — ' + e.artist + '  (score ' + e.crossPlatformScore + ')'));
      const srcs = (t.sourcesUsed || []).filter((s) => s.status === 'ok').map((s) => s.sourceId);
      if (srcs.length) lines.push('', 'Sources: ' + [...new Set(srcs)].join(', '));
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'chart', aliases: ['topmusic', 'charts'], category: 'music',
    description: 'Music charts by country', usage: '-chart [us|uk|pk]',
    handler: async (ctx) => {
      const country = (ctx.args[0] || 'global').toLowerCase();
      await ctx.reply('📊 Fetching charts (' + country.toUpperCase() + ')…');
      const c = await manager.getCharts(country === 'global' ? undefined : country);
      const bySource = {};
      for (const e of c.entries) { (bySource[e.source] = bySource[e.source] || []).push(e); }
      const lines = ['📊 CHARTS — ' + country.toUpperCase(), ''];
      for (const src of Object.keys(bySource).slice(0, 4)) {
        lines.push('— ' + src + ' —');
        bySource[src].slice(0, 10).forEach((e) => lines.push(e.rank + '. ' + e.title + ' — ' + e.artist));
        lines.push('');
      }
      await ctx.reply(lines.join('\n') || 'No chart data available right now.');
    },
  },
  {
    name: 'newmusic', aliases: ['newreleases'], category: 'music',
    description: 'New music releases', usage: '-newmusic [country]',
    handler: async (ctx) => {
      const r = await manager.getNewReleases({ country: (ctx.args[0] || 'global').toLowerCase() });
      const lines = ['🆕 NEW RELEASES', ''];
      r.slice(0, 15).forEach((t, i) => {
        lines.push((i + 1) + '. ' + (t.title || '?') + ' — ' + (t.artist || '?'));
        if (t.album) lines.push('   Album: ' + t.album);
        if (t.releaseDate) lines.push('   Released: ' + t.releaseDate);
        if (t.url) lines.push('   ' + t.url);
      });
      await ctx.reply(lines.join('\n') || 'No new releases found right now.');
    },
  },
  {
    name: 'identify', aliases: [], category: 'music',
    description: 'Identify a song from an audio clip', usage: '-identify (send with audio)',
    handler: async (ctx) => {
      if (!ctx.audioBuffer) { await ctx.reply('Send an audio clip with the caption -identify and I’ll try to recognize it.\n_Note: recognition needs an authorized provider key (ACRCloud or AudD) in .env._'); return; }
      await ctx.reply('🎧 Listening…');
      const r = await manager.identifyAudio(ctx.audioBuffer, ctx.mime || 'audio/ogg');
      if (r.status === 'auth_required') { await ctx.reply('⚠️ ' + r.error); return; }
      const id = r.identification || {};
      let msg = '🎵 Song identified\n\nSong: ' + (r.match.title || '?') + '\nArtist: ' + (r.match.artist || '?') +
        '\nAlbum: ' + (r.match.album || '—') + '\nConfidence: ' + Math.round((id.confidence || 0) * 100) + '%\n';
      if (r.lyrics && r.lyrics.available) msg += 'Lyrics: ' + r.lyrics.url + '\n';
      const links = r.musicLinks || {};
      const have = [links.spotify, links.youtube, links.appleMusic].filter(Boolean);
      if (have.length) msg += 'Music links:\n' + have.map((l) => '• ' + l).join('\n');
      await ctx.reply(msg);
    },
  },
  {
    name: 'identifyvoice', aliases: [], category: 'music',
    description: 'Identify from a voice note (humming/singing)', usage: '-identifyvoice (send with voice note)',
    handler: async (ctx) => {
      // Same pipeline as -identify; provider decides if humming is supported.
      const cmd = commands.find((c) => c.name === 'identify');
      await cmd.handler(ctx);
    },
  },
];

// regional lyric shortcuts
const regionalShortcuts = [
  ['pklyrics', 'pakistan', '🇵🇰'], ['urdulyrics', 'urdu', '🇵🇰'], ['punjabilyrics', 'punjabi', '🇮🇳'],
  ['hindilyrics', 'india', '🇮🇳'],
];
for (const [name, region, flag] of regionalShortcuts) {
  commands.push({
    name, aliases: [], category: 'music',
    description: 'Regional lyrics search (' + region + ')', usage: '-' + name + ' <song>',
    handler: async (ctx) => {
      if (!(await needQuery(ctx, ctx.reply))) return;
      await ctx.reply(flag + ' Searching ' + region + ' sources…');
      const found = await searchEngine.searchRegional(ctx.query, region);
      if (!found.best) { await ctx.reply('❌ No match found for "' + ctx.query + '".'); return; }
      const r = await manager.search(found.best.candidate.title + ' ' + found.best.candidate.artist, { lyrics: true });
      await ctx.reply(fmtTrack(r));
    },
  });
}

/** Router: returns true if the message was a music command. */
async function handleMusicMessage(text, ctx) {
  const t = String(text || '').trim();
  if (!t.startsWith(PREFIX)) return false;
  const without = t.slice(PREFIX.length).trim();
  if (!without) return false;
  const [rawName, ...rest] = without.split(/\s+/);
  const name = rawName.toLowerCase();
  const cmd = commands.find((c) => c.name === name || (c.aliases || []).includes(name));
  if (!cmd) return false;
  const fullCtx = Object.assign({}, ctx, {
    args: rest,
    query: rest.join(' ').trim(),
    raw: t,
  });
  try {
    await cmd.handler(fullCtx);
  } catch (err) {
    try { await ctx.reply('⚠️ Music engine error: ' + String((err && err.message) || err).slice(0, 200)); } catch (e) { /* ignore */ }
  }
  return true;
}

module.exports = { PREFIX, commands, handleMusicMessage, MUSIC_MENU, manager };
