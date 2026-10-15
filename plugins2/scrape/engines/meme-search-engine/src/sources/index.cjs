'use strict';

/**
 * sources/index.cjs — source registry.
 *
 * Only sources verified live and key-free are wired. Key-gated services
 * (Giphy, Tenor) ship as `auth_required` stubs: they declare the contract
 * and the env var that would enable them, but never fake results.
 */
const imgflip = require('./imgflip.cjs');
const memeapi = require('./memeapi.cjs');
const wikimedia = require('./wikimedia.cjs');

function authRequiredStub(name, envVar, note) {
  return {
    name,
    status: 'auth_required',
    auth: `env:${envVar}`,
    async search() {
      throw new Error(`${name}: needs ${envVar} — ${note}`);
    },
  };
}

const REGISTRY = {
  imgflip,
  memeapi,
  wikimedia,
  giphy: authRequiredStub('giphy', 'GIPHY_API_KEY', 'api.giphy.com requires a key; none configured'),
  tenor: authRequiredStub('tenor', 'TENOR_API_KEY', 'tenor.googleapis.com requires a key; none configured'),
};

function list() {
  return Object.values(REGISTRY).map((s) => ({
    name: s.name,
    status: s.status,
    auth: s.auth,
  }));
}

function get(name) {
  const s = REGISTRY[name];
  if (!s) throw new Error(`unknown source: ${name}`);
  return s;
}

module.exports = { REGISTRY, list, get };
