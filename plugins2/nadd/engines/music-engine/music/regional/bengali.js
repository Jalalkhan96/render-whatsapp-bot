'use strict';
/**
 * Regional strategy: Bengali music (IN/BD).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'bengali',
  name: 'Bengali Music',
  type: 'regional',
  country: 'IN',
  languages: ['bn', 'en', 'hi'],
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
  'jiosaavn',
  'gaana',
  'hungama',
  'saregama',
  'youtube',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['bn', 'en', 'hi'];

// Hints only — not a closed catalog.
const artists = [
  'Arijit Singh',
  'Shreya Ghoshal',
  'Kishore Kumar',
  'Hemanta Mukherjee',
  'Manna Dey',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
