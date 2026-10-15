'use strict';
/**
 * Regional strategy: Punjabi music (Punjab region, IN/PK).
 * Strategy module — no search() function; declares source priority,
 * languages, artist hints, and romanized query variants for the engine.
 */
const { romanVariants } = require('../query-normalizer');

const META = {
  id: 'punjabi',
  name: 'Punjabi Music',
  type: 'regional',
  country: 'IN',
  languages: ['pa', 'en', 'hi'],
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
  'youtube',
  'spotify',
  'apple-music',
  'deezer',
  'musicbrainz',
];

const languages = ['pa', 'en', 'hi'];

// Hints only — not a closed catalog.
const artists = [
  'Diljit Dosanjh',
  'AP Dhillon',
  'Shubh',
  'Gurdas Maan',
  'Amrinder Gill',
  'Karan Aujla',
];

function queryVariants(q) {
  const base = String(q || '').trim();
  if (!base) return [];
  return [base, ...romanVariants(base, 4).slice(1)];
}

module.exports = { META, sourceOrder, languages, artists, queryVariants };
