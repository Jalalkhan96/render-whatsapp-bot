/*
 * core/query-router.cjs — query -> category -> best sources (§5, §25-35).
 *
 * Command prefixes map to source sets. Universal `.knowledge` queries get
 * category detection from the query text. NEVER routes every source for
 * every query — always a category-specific subset.
 */
'use strict';

const COMMAND_ROUTES = {
  // §55 commands -> source ids
  wiki: ['wikipedia', 'wikidata', 'dbpedia'],
  wikidata: ['wikidata', 'wdqs', 'dbpedia', 'wikipedia'],
  archive: ['internet-archive', 'wayback', 'loc', 'europeana', 'dpla', 'british-library', 'trove', 'digitalnz', 'wikimedia-commons', 'public-domain-review'],
  archiveall: ['internet-archive', 'wayback', 'loc', 'europeana', 'dpla', 'british-library', 'trove', 'digitalnz', 'wikimedia-commons', 'public-domain-review'],
  book: ['open-library', 'internet-archive', 'gutenberg', 'google-books', 'hathitrust', 'standardebooks', 'manybooks'],
  author: ['open-library', 'gutenberg', 'internet-archive', 'wikidata', 'wikipedia', 'standardebooks'],
  document: ['internet-archive', 'loc', 'europeana', 'dpla', 'wikisource', 'gutenberg'],
  history: ['wikipedia', 'wikisource', 'internet-archive', 'loc', 'europeana', 'dpla', 'chronicling-america', 'trove'],
  newspaper: ['chronicling-america', 'loc', 'internet-archive', 'trove', 'europeana', 'british-library', 'google-books'],
  paper: ['openalex', 'crossref', 'semanticscholar', 'arxiv', 'pubmed', 'pmc', 'europepmc', 'doaj', 'core', 'zenodo'],
  research: ['openalex', 'crossref', 'semanticscholar', 'arxiv', 'pubmed', 'europepmc', 'zenodo', 'figshare', 'osf', 'doaj'],
  dataset: ['datagov', 'dataeuropa', 'worldbank', 'undata', 'oecd', 'who', 'imf', 'huggingface', 'zenodo', 'figshare', 'dryad'],
  govdata: ['datagov', 'govinfo', 'congress', 'nara', 'nara-catalog', 'worldbank', 'undata', 'oecd', 'who', 'imf', 'dataeuropa'],
  science: ['nasa', 'noaa', 'usgs', 'openalex', 'arxiv', 'pubmed', 'pmc', 'europepmc'],
  place: ['openstreetmap', 'geonames', 'wikidata', 'wikipedia', 'wikivoyage', 'geograph', 'geonames-wikipedia'],
  mapinfo: ['openstreetmap', 'geonames', 'wikidata', 'wikipedia', 'mapillary'],
  oldphoto: ['wikimedia-commons', 'internet-archive', 'loc', 'europeana', 'dpla', 'smithsonian', 'trove', 'digitalnz', 'british-library', 'picryl'],
  museum: ['smithsonian', 'met-museum', 'artic', 'clevelandart', 'rijksmuseum', 'europeana', 'harvard', 'wellcome', 'getty', 'yale'],
  art: ['met-museum', 'artic', 'clevelandart', 'rijksmuseum', 'europeana', 'harvard', 'wellcome', 'google-arts-culture'],
  publicdomain: ['gutenberg', 'standardebooks', 'librivox', 'internet-archive', 'wikimedia-commons', 'public-domain-review', 'picryl', 'wikisource'],
  webarchive: ['wayback', 'commoncrawl', 'archive-it', 'uk-web-archive', 'loc-web-archives'],
  ai: ['huggingface', 'arxiv', 'openalex', 'semanticscholar', 'crossref', 'zenodo'],
  searchtext: ['internet-archive', 'open-library', 'loc', 'wikisource', 'gutenberg'],
  booksearch: ['internet-archive', 'google-books', 'open-library', 'loc'],
};

// Universal-search category detection (§5 examples).
const CATEGORY_PATTERNS = [
  { category: 'book', test: /\b(book|novel|ebook|isbn|author|edition|publisher|read|literature|poem|poetry)\b/i, sources: COMMAND_ROUTES.book },
  { category: 'research', test: /\b(paper|research|study|journal|doi|arxiv|preprint|thesis|citation|experiment)\b/i, sources: COMMAND_ROUTES.paper },
  { category: 'dataset', test: /\b(dataset|data set|statistics?|population|gdp|census|survey results?)\b/i, sources: COMMAND_ROUTES.dataset },
  { category: 'oldphoto', test: /\b(photo|photograph|image|picture|old photo|historical photo)\b/i, sources: COMMAND_ROUTES.oldphoto },
  { category: 'place', test: /\b(where is|map of|city of|town|village|coordinates|location of)\b/i, sources: COMMAND_ROUTES.place },
  { category: 'history', test: /\b(history|historical|empire|war|civilization|ancient|century \d|1[5-9]\d{2}s?)\b/i, sources: COMMAND_ROUTES.history },
  { category: 'science', test: /\b(nasa|space|planet|star|galaxy|climate|earthquake|mission)\b/i, sources: COMMAND_ROUTES.science },
  { category: 'ai', test: /\b(ai model|llm|machine learning model|dataset for|neural network)\b/i, sources: COMMAND_ROUTES.ai },
  { category: 'newspaper', test: /\b(newspaper|headlines?|front page|press)\b/i, sources: COMMAND_ROUTES.newspaper },
  { category: 'food', test: /\b(food|barcode|nutrition|ingredients|product)\b/i, sources: ['openfoodfacts', 'openbeautyfacts', 'openproductsfacts', 'wikidata-products'] },
  { category: 'museum', test: /\b(museum|artwork|painting|sculpture|exhibit)\b/i, sources: COMMAND_ROUTES.museum },
  { category: 'government', test: /\b(law|bill|legislation|regulation|congress|government record)\b/i, sources: COMMAND_ROUTES.govdata },
];

const DEFAULT_SOURCES = ['wikipedia', 'wikidata', 'dbpedia', 'openalex', 'loc', 'internet-archive'];

class KnowledgeRouter {
  constructor(registry) {
    this.registry = registry || null;
  }

  _filterToAvailable(ids) {
    if (!this.registry) return ids;
    return ids.filter((id) => {
      const m = this.registry.get(id);
      return m && m.enabled && m.implemented;
    });
  }

  detectCategory(query) {
    const q = String(query || '').trim();
    if (!q) return { category: 'general', sources: DEFAULT_SOURCES.slice(), via: 'default' };
    for (const p of CATEGORY_PATTERNS) {
      if (p.test.test(q)) return { category: p.category, sources: p.sources.slice(), via: 'pattern' };
    }
    return { category: 'general', sources: DEFAULT_SOURCES.slice(), via: 'default' };
  }

  selectSources(query, categoryOrCommand) {
    // categoryOrCommand may be a .command name or a detected category.
    let ids;
    if (categoryOrCommand && COMMAND_ROUTES[categoryOrCommand]) {
      ids = COMMAND_ROUTES[categoryOrCommand].slice();
    } else {
      const detected = this.detectCategory(query);
      if (categoryOrCommand && detected.category !== categoryOrCommand) {
        // honour explicit category hints by re-running detection over category tokens
        const hinted = CATEGORY_PATTERNS.find((p) => p.category === categoryOrCommand);
        ids = hinted ? hinted.sources.slice() : detected.sources.slice();
      } else {
        ids = detected.sources.slice();
      }
    }
    // Never return the full 100; cap universal routing at a sane subset.
    ids = ids.slice(0, 10);
    return this._filterToAvailable(ids);
  }

  routeCommand(command, query) {
    const cmd = String(command || '').replace(/^[.\-]/, '').toLowerCase();
    if (cmd === 'knowledge') {
      const d = this.detectCategory(query);
      return { command: cmd, category: d.category, sources: this._filterToAvailable(d.sources.slice(0, 10)) };
    }
    if (COMMAND_ROUTES[cmd]) {
      return { command: cmd, category: cmd, sources: this._filterToAvailable(COMMAND_ROUTES[cmd].slice(0, 10)) };
    }
    return { command: cmd, category: 'unknown', sources: [] };
  }

  static commandRoutes() { return COMMAND_ROUTES; }
}

module.exports = { KnowledgeRouter, COMMAND_ROUTES, DEFAULT_SOURCES, CATEGORY_PATTERNS };
