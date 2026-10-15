/*
 * core/registry.cjs — source registry for all 100 adapters (§77, §78).
 *
 * Each entry maps an id to its adapter module path. The registry validates
 * each module's exported `meta` + `createSource` contract and exposes
 * list()/get(id)/byCategory()/enabled().
 */
'use strict';

const SOURCE_FILES = [
  // Group A — Wikimedia / knowledge (sources/wiki/)
  'sources/wiki/wikipedia.cjs',
  'sources/wiki/wikidata.cjs',
  'sources/wiki/wikimedia-commons.cjs',
  'sources/wiki/wikisource.cjs',
  'sources/wiki/wiktionary.cjs',
  'sources/wiki/wikibooks.cjs',
  'sources/wiki/wikiversity.cjs',
  'sources/wiki/wikiquote.cjs',
  'sources/wiki/wikinews.cjs',
  'sources/wiki/wikivoyage.cjs',
  // Group B — books / digital libraries (sources/books/)
  'sources/books/internet-archive.cjs',
  'sources/books/open-library.cjs',
  'sources/books/gutenberg.cjs',
  'sources/books/hathitrust.cjs',
  'sources/books/google-books.cjs',
  'sources/books/isfdb.cjs',
  'sources/books/standardebooks.cjs',
  'sources/books/librivox.cjs',
  'sources/books/manybooks.cjs',
  'sources/books/feedbooks.cjs',
  // Group C — government / public records (sources/government/)
  'sources/government/loc.cjs',
  'sources/government/chronicling-america.cjs',
  'sources/government/congress.cjs',
  'sources/government/govinfo.cjs',
  'sources/government/datagov.cjs',
  'sources/government/nara.cjs',
  'sources/government/nara-catalog.cjs',
  'sources/government/dpla.cjs',
  'sources/government/smithsonian.cjs',
  'sources/government/nasa.cjs',
  // Group D — museums (sources/museums/)
  'sources/museums/europeana.cjs',
  'sources/museums/british-library.cjs',
  'sources/museums/wellcome.cjs',
  'sources/museums/rijksmuseum.cjs',
  'sources/museums/met-museum.cjs',
  'sources/museums/artic.cjs',
  'sources/museums/clevelandart.cjs',
  'sources/museums/getty.cjs',
  'sources/museums/yale.cjs',
  'sources/museums/harvard.cjs',
  // Group E — libraries: AU/NZ + text libraries (sources/libraries/)
  'sources/libraries/trove.cjs',
  'sources/libraries/digitalnz.cjs',
  'sources/libraries/nla.cjs',
  'sources/libraries/naa.cjs',
  'sources/libraries/nz-archives.cjs',
  'sources/libraries/sacred-texts.cjs',
  'sources/libraries/perseus.cjs',
  'sources/libraries/bodleian.cjs',
  'sources/libraries/gallica.cjs',
  // Group F — research / scholarly (sources/research/)
  'sources/research/openalex.cjs',
  'sources/research/crossref.cjs',
  'sources/research/semanticscholar.cjs',
  'sources/research/arxiv.cjs',
  'sources/research/pubmed.cjs',
  'sources/research/pmc.cjs',
  'sources/research/europepmc.cjs',
  'sources/research/doaj.cjs',
  'sources/research/core.cjs',
  'sources/research/zenodo.cjs',
  'sources/research/figshare.cjs',
  'sources/research/dryad.cjs',
  'sources/research/osf.cjs',
  'sources/research/ssrn.cjs',
  'sources/research/researchgate.cjs',
  // Group G — science / statistics data (sources/science/)
  'sources/science/noaa.cjs',
  'sources/science/usgs.cjs',
  'sources/science/datagovuk.cjs',
  'sources/science/dataeuropa.cjs',
  'sources/science/worldbank.cjs',
  'sources/science/undata.cjs',
  'sources/science/oecd.cjs',
  'sources/science/who.cjs',
  'sources/science/unesco-uis.cjs',
  'sources/science/imf.cjs',
  // Group H — maps + web archives (sources/maps/)
  'sources/maps/openstreetmap.cjs',
  'sources/maps/geonames.cjs',
  'sources/maps/wikimapia.cjs',
  'sources/maps/geograph.cjs',
  'sources/maps/mapillary.cjs',
  'sources/maps/wayback.cjs',
  'sources/maps/commoncrawl.cjs',
  'sources/maps/archive-it.cjs',
  'sources/maps/uk-web-archive.cjs',
  'sources/maps/loc-web-archives.cjs',
  // Group I — aggregators (sources/aggregators/)
  'sources/aggregators/dbpedia.cjs',
  'sources/aggregators/wdqs.cjs',
  'sources/aggregators/geonames-wikipedia.cjs',
  'sources/aggregators/opencorporates.cjs',
  'sources/aggregators/opensanctions.cjs',
  'sources/aggregators/openfoodfacts.cjs',
  'sources/aggregators/openbeautyfacts.cjs',
  'sources/aggregators/openproductsfacts.cjs',
  'sources/aggregators/wikidata-products.cjs',
  'sources/aggregators/open-product-data.cjs',
  // Group J — misc (sources/misc/)
  'sources/misc/google-arts-culture.cjs',
  'sources/misc/public-domain-review.cjs',
  'sources/misc/picryl.cjs',
  'sources/misc/bhl.cjs',
  'sources/misc/smithsonian-biodiversity.cjs',
  'sources/misc/huggingface.cjs',
];

const REQUIRED_META = ['id', 'name', 'category', 'transport'];
const VALID_TRANSPORTS = ['api', 'dump', 'feed', 'html', 'stub'];
const VALID_STATUSES = ['ok', 'limited', 'auth_required', 'not_implemented'];

class RegistryError extends Error {}

function validateMeta(meta, file) {
  if (!meta || typeof meta !== 'object') throw new RegistryError(`${file}: missing meta export`);
  for (const f of REQUIRED_META) {
    if (meta[f] === undefined || meta[f] === null || meta[f] === '') {
      throw new RegistryError(`${file}: meta.${f} is required`);
    }
  }
  if (meta.baseUrl != null && typeof meta.baseUrl !== 'string') {
    throw new RegistryError(`${file}: meta.baseUrl must be a string or null`);
  }
  if (!VALID_TRANSPORTS.includes(meta.transport)) {
    throw new RegistryError(`${file}: meta.transport must be one of ${VALID_TRANSPORTS.join(',')}`);
  }
  if (meta.status && !VALID_STATUSES.includes(meta.status)) {
    throw new RegistryError(`${file}: meta.status must be one of ${VALID_STATUSES.join(',')}`);
  }
  if (typeof meta.implemented !== 'boolean') {
    throw new RegistryError(`${file}: meta.implemented must be boolean`);
  }
  if (meta.capabilities && typeof meta.capabilities !== 'object') {
    throw new RegistryError(`${file}: meta.capabilities must be an object`);
  }
  return true;
}

function loadRegistry(engineRoot) {
  const entries = [];
  const byId = new Map();
  const errors = [];
  for (const file of SOURCE_FILES) {
    const full = `${engineRoot}/${file}`;
    try {
      const mod = require(full);
      if (!mod || typeof mod.createSource !== 'function') {
        throw new RegistryError(`${file}: missing createSource(deps) export`);
      }
      validateMeta(mod.meta, file);
      if (byId.has(mod.meta.id)) {
        throw new RegistryError(`${file}: duplicate source id '${mod.meta.id}'`);
      }
      const entry = { id: mod.meta.id, file, module: mod, meta: mod.meta, enabled: mod.meta.enabled !== false };
      entries.push(entry);
      byId.set(mod.meta.id, entry);
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }
  return { entries, byId, errors, count: entries.length, expected: SOURCE_FILES.length };
}

function makeRegistry(engineRoot) {
  const loaded = loadRegistry(engineRoot);
  const instances = new Map();
  return {
    errors: loaded.errors,
    count: loaded.count,
    expected: loaded.expected,
    files: SOURCE_FILES.slice(),
    list() { return loaded.entries.map((e) => Object.assign({}, e.meta, { enabled: e.enabled })); },
    get(id) {
      const e = loaded.byId.get(id);
      // The test harness (§99) asserts `createSource` is visible on the
      // registry entry; expose it from the loaded module alongside meta.
      return e ? Object.assign({ createSource: e.module.createSource }, e.meta, { enabled: e.enabled }) : null;
    },
    byCategory(cat) {
      return loaded.entries.filter((e) => e.meta.category === cat).map((e) => Object.assign({}, e.meta, { enabled: e.enabled }));
    },
    enabled() {
      return loaded.entries.filter((e) => e.enabled).map((e) => Object.assign({}, e.meta, { enabled: e.enabled }));
    },
    has(id) { return loaded.byId.has(id); },
    raw(id) {
      // Raw registry entry including the loaded module (for tests/tools).
      return loaded.byId.get(id) || null;
    },
    instantiate(id, deps) {
      const e = loaded.byId.get(id);
      if (!e) throw new RegistryError(`unknown source id '${id}'`);
      if (!instances.has(id)) instances.set(id, e.module.createSource(deps || {}));
      return instances.get(id);
    },
    setEnabled(id, on) {
      const e = loaded.byId.get(id);
      if (!e) throw new RegistryError(`unknown source id '${id}'`);
      e.enabled = !!on;
      return e.enabled;
    },
  };
}

module.exports = {
  SOURCE_FILES,
  REQUIRED_META,
  loadRegistry,
  makeRegistry,
  RegistryError,
};
