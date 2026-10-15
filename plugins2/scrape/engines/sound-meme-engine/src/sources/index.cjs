'use strict';

/**
 * sources/index.cjs — registry. Only verified-live key-free sources are
 * wired. The big sound-meme sites are Cloudflare/JS-gated from datacenters;
 * they ship as `blocked` stubs that explain exactly why, instead of faking.
 */
const wikimediaAudio = require('./wikimedia-audio.cjs');
const youtube = require('./youtube.cjs');

function blockedStub(name, why) {
  return {
    name,
    status: 'blocked',
    auth: 'none',
    async search() {
      throw new Error(`${name}: blocked — ${why}`);
    },
  };
}

const REGISTRY = {
  'wikimedia-audio': wikimediaAudio,
  youtube,
  myinstants: blockedStub('myinstants',
    'Cloudflare 403 from datacenters even with full browser headers (verified 2026-10-08). ' +
    'May work from a residential IP; adapter contract: GET https://www.myinstants.com/search/?name=<q> ' +
    'then parse play(\'/media/sounds/xxx.mp3\') buttons.'),
  voicy: blockedStub('voicy',
    'HTTP 403 from datacenters (verified 2026-10-08).'),
  '101soundboards': blockedStub('101soundboards',
    'fully JS-rendered — zero mp3 references in served HTML (verified 2026-10-08).'),
  mixkit: blockedStub('mixkit',
    'audio URLs are JS-loaded, absent from static HTML (verified 2026-10-08).'),
};

function list() {
  return Object.values(REGISTRY).map((s) => ({ name: s.name, status: s.status, auth: s.auth }));
}

function get(name) {
  const s = REGISTRY[name];
  if (!s) throw new Error(`unknown source: ${name}`);
  return s;
}

module.exports = { REGISTRY, list, get };
