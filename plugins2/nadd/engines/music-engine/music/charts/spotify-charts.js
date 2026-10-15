'use strict';
/**
 * Spotify Charts adapter.
 * Spotify's public charts site (charts.spotify.com) is JS/tokenized and has no
 * public charts API endpoint, so this adapter cannot scrape a chart without
 * credentials. Without SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET it returns
 * 'auth_required'. With keys it verifies them via the documented Client
 * Credentials flow, but the Spotify Web API exposes no charts endpoint, so it
 * honestly reports 'unsupported' rather than fabricating chart data.
 */
const { fetchText } = require('../http');

const META = { id:'spotify-charts', name:'Spotify Charts', type:'charts', country:'US',
  languages:['en'], searchSupported:false, directLookupSupported:false,
  apiSupported:true, scrapingSupported:false, priority:2,
  needsKey:'SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET',
  baseUrl:'https://charts.spotify.com', enabled:true };

function needKeys() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return (id && secret) ? { id, secret } : null;
}

async function verifyKeys(keys) {
  const body = 'grant_type=client_credentials';
  const auth = Buffer.from(keys.id + ':' + keys.secret).toString('base64');
  const r = await fetchText('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + auth },
    body, retries: 1,
  });
  if (!r.ok) return false;
  try {
    const d = JSON.parse(r.text);
    return !!(d && d.access_token);
  } catch (e) { return false; }
}

async function charts(country, opts = {}) {
  const keys = needKeys();
  if (!keys) {
    return { status:'auth_required', entries:[],
      note:'Spotify Charts require SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET' };
  }
  const ok = await verifyKeys(keys);
  if (!ok) {
    return { status:'auth_required', entries:[],
      note:'SPOTIFY_CLIENT_ID/SECRET were rejected by Spotify token endpoint' };
  }
  return { status:'unsupported', entries:[],
    note:'Spotify credentials valid, but the Spotify Web API has no charts endpoint and charts.spotify.com requires interactive login; no chart data available' };
}

async function search(query, opts = {}) {
  const c = await charts(opts.country || 'US', opts);
  return { status:c.status, results:[], note:c.note };
}

async function lookup() { return null; }

async function health() {
  if (!needKeys()) {
    return { status:'auth_required', latencyMs:0,
      note:'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to enable' };
  }
  const t0 = Date.now();
  const ok = await verifyKeys(needKeys());
  return ok
    ? { status:'ok', latencyMs: Date.now() - t0, note:'Spotify credentials valid; no charts endpoint available' }
    : { status:'auth_required', latencyMs: Date.now() - t0, note:'Spotify credentials rejected' };
}

module.exports = { META, search, lookup, health, charts };
