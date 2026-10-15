'use strict';
/**
 * Regional strategy: Indian music (all languages).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'india',
  name: 'Indian Music',
  type: 'regional',
  country: 'IN',
  languages: ['hi', 'en', 'pa', 'bn', 'ta', 'te', 'ml', 'kn', 'mr', 'gu'],
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
  'wynk',
  'saregama',
  'raaga',
  'youtube',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['hi', 'en', 'pa', 'bn', 'ta', 'te', 'ml', 'kn', 'mr', 'gu'];

// Hints only — not a closed catalog.
const artists = [
  'Arijit Singh',
  'Shreya Ghoshal',
  'A.R. Rahman',
  'Sonu Nigam',
  'Lata Mangeshkar',
  'Kishore Kumar',
  'Alka Yagnik',
  'Udit Narayan',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
