'use strict';
/**
 * Regional strategy: Pashto music (PK/AF).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'pashto',
  name: 'Pashto Music',
  type: 'regional',
  country: 'PK',
  languages: ['ps', 'ur', 'en'],
  searchSupported: true,
  directLookupSupported: false,
  apiSupported: false,
  scrapingSupported: false,
  priority: 1,
  needsKey: null,
  baseUrl: null,
  enabled: true,
};

const sourceOrder = [
  'youtube',
  'jiosaavn',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['ps', 'ur', 'en'];

// Hints only — not a closed catalog (kept short; Pashto catalog coverage is thin).
const artists = [
  'Gul Panra',
  'Karan Khan',
  'Zeek Afridi',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
