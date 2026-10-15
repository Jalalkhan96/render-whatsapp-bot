'use strict';
/** Query normalization + --flag parsing. */

function normalizeQuery(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * parseFlags("sunset --limit 20 --landscape") ->
 *   { query: "sunset", filters: { limit:20, orientation:'landscape', ... } }
 */
function parseFlags(text) {
  const filters = {
    limit: 0, orientation: '', minWidth: 0, minHeight: 0, color: '',
    license: '', commercial: false, noAttribution: false,
    transparent: false, page: 1, size: '',
  };
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const queryParts = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const take = () => tokens[++i];
    if (t === '--limit' && tokens[i + 1]) filters.limit = parseInt(take(), 10) || 0;
    else if (t === '--landscape' || t === '--horizontal') filters.orientation = 'landscape';
    else if (t === '--portrait' || t === '--vertical') filters.orientation = 'portrait';
    else if (t === '--square') filters.orientation = 'square';
    else if (t === '--panorama') filters.orientation = 'panorama';
    else if (t === '--4k') { filters.minWidth = 3840; filters.size = '4k'; }
    else if (t === '--hd') { filters.minWidth = 1280; filters.size = 'hd'; }
    else if (t === '--transparent') filters.transparent = true;
    else if (t === '--commercial') filters.commercial = true;
    else if (t === '--cc0') filters.license = 'cc0';
    else if (t === '--public-domain') filters.license = 'public-domain';
    else if (t === '--license' && tokens[i + 1]) filters.license = String(take()).toLowerCase();
    else if (t === '--no-attribution') filters.noAttribution = true;
    else if (t === '--min-width' && tokens[i + 1]) filters.minWidth = parseInt(take(), 10) || 0;
    else if (t === '--min-height' && tokens[i + 1]) filters.minHeight = parseInt(take(), 10) || 0;
    else if (t === '--color' && tokens[i + 1]) filters.color = String(take()).toLowerCase();
    else if (t === '--page' && tokens[i + 1]) filters.page = Math.max(1, parseInt(take(), 10) || 1);
    else queryParts.push(tokens[i]);
  }
  return { query: normalizeQuery(queryParts.join(' ')), filters };
}

function parseInput(text) { return parseFlags(text); }

module.exports = { normalizeQuery, parseFlags, parseInput };
