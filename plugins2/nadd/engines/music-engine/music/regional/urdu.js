'use strict';
/**
 * Regional strategy: Urdu music (Pakistan).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'urdu',
  name: 'Urdu Music',
  type: 'regional',
  country: 'PK',
  languages: ['ur', 'en'],
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
  'cokestudio-pk',
  'patari',
  'jiosaavn',
  'youtube',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['ur', 'en'];

// Hints only — not a closed catalog.
const artists = [
  'Atif Aslam',
  'Rahat Fateh Ali Khan',
  'Abida Parveen',
  'Ali Zafar',
  'Asim Azhar',
  'Aima Baig',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
