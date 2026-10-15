'use strict';
/**
 * Regional strategy: South Indian music (ta/te/ml/kn).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'south-indian',
  name: 'South Indian Music',
  type: 'regional',
  country: 'IN',
  languages: ['ta', 'te', 'ml', 'kn', 'en'],
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
  'raaga',
  'wynk',
  'saregama',
  'youtube',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['ta', 'te', 'ml', 'kn', 'en'];

// Hints only — not a closed catalog.
const artists = [
  'A.R. Rahman',
  'Anirudh Ravichander',
  'Sid Sriram',
  'Shreya Ghoshal',
  'Ilaiyaraaja',
  'S.P. Balasubrahmanyam',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
