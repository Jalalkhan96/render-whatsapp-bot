const providers = require('./providers.json');
const { lookupPitc } = require('./pitc');

const PITC_PROVIDERS = new Set([
  'PESCO', 'IESCO', 'LESCO', 'MEPCO', 'FESCO', 'GEPCO',
  'HESCO', 'SEPCO', 'QESCO', 'TESCO'
]);

function normalizeProvider(value) {
  const provider = String(value || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  if (provider === 'KE' || provider === 'K-ELECTRIC') return 'K_ELECTRIC';
  return provider;
}

function getProvider(provider) {
  const key = normalizeProvider(provider);
  for (const [category, entries] of Object.entries(providers)) {
    if (entries[key]) return { key, category, url: entries[key] };
  }
  return null;
}

async function lookup(provider, reference) {
  const item = getProvider(provider);
  if (!item) throw new Error(`Unknown provider. Use .billscrap for the provider list.`);
  if (!reference) throw new Error(`Reference/customer number required. Example: .bill ${item.key} 12345678901234`);

  if (PITC_PROVIDERS.has(item.key)) {
    return { ...item, lookup: await lookupPitc(item.key, reference) };
  }

  return {
    ...item,
    lookup: {
      sourceUrl: item.url,
      fields: {},
      manual: true,
      message: `${item.key} ka official portal open karein aur required account/consumer number enter karein.`
    }
  };
}

function listProviders() {
  return Object.entries(providers).map(([category, entries]) => ({
    category,
    providers: Object.keys(entries)
  }));
}

module.exports = { providers, normalizeProvider, getProvider, lookup, listProviders };
