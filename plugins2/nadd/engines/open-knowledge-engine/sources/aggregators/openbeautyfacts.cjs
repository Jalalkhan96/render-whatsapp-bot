/*
 * sources/aggregators/openbeautyfacts.cjs — Open Beauty Facts product search adapter.
 *
 * Endpoint (verified 2026-10-05):
 *   https://world.openbeautyfacts.org/cgi/search.pl?search_terms=<q>
 *     &search_simple=1&action=process&json=1&page_size=20
 * Returns products[] with product_name, brands, ingredients_text,
 * image URLs and the barcode (code).
 *
 * API/dumps preferred over HTML scraping — this adapter uses the JSON API
 * only. Ingredient/fact values are passed through as reported; never
 * invented. Database: ODbL-1.0. Product photos: CC-BY-SA.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'openbeautyfacts',
  name: 'Open Beauty Facts',
  category: 'product',
  transport: 'api',
  baseUrl: 'https://world.openbeautyfacts.org',
  docsUrl: 'https://world.openbeautyfacts.org/dev/api',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, api: true, bulk: false, coordinates: false,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 5,
  description: 'Open Beauty Facts crowd-sourced cosmetics database via the JSON search API (search.pl). Returns product names, brands, ingredients and images as reported, plus barcodes. Facts are passed through as-is and never invented. Database licensed ODbL-1.0; product photos CC-BY-SA.',
};

const SEARCH_API = 'https://world.openbeautyfacts.org/cgi/search.pl';

class OpenBeautyFactsSource extends BaseKnowledgeSource {
  _mapProduct(p) {
    const code = p.code != null ? String(p.code) : null;
    const brands = p.brands || null;
    const quantity = p.quantity || null;
    return {
      id: code ? `openbeautyfacts:${code}` : null,
      sourceId: code,
      sourceUrl: code ? `https://world.openbeautyfacts.org/product/${code}` : null,
      title: p.product_name || p.product_name_en || null,
      description: [brands, quantity].filter(Boolean).join(' · ') || null,
      type: 'product',
      creator: brands,
      date: p.created_datetime || null,
      updatedAt: p.last_modified_datetime || null,
      language: p.lang || null,
      country: Array.isArray(p.countries_tags) && p.countries_tags.length ? String(p.countries_tags[0]) : null,
      contentUrl: code ? `https://world.openbeautyfacts.org/product/${code}` : null,
      thumbnailUrl: p.image_front_small_url || p.image_front_url || p.image_small_url || p.image_url || null,
      license: 'ODbL-1.0',
      licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
      rights: 'unknown',
      identifiers: { barcode: code, openbeautyfacts: code },
      tags: Array.isArray(p.brands_tags) ? p.brands_tags.filter((t) => typeof t === 'string').slice(0, 6) : [],
      categories: Array.isArray(p.categories_tags) ? p.categories_tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
      coordinates: { lat: null, lon: null },
      metadata: {
        dataLicense: 'ODbL-1.0',
        barcode: code,
        brands,
        quantity,
        ingredientsText: p.ingredients_text || null,
        periodAfterOpening: p.period_after_opening || null,
        stores: p.stores || null,
        packaging: p.packaging || null,
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const url = this._buildUrl(SEARCH_API, {
      search_terms: q, search_simple: 1, action: 'process', json: 1, page_size: limit,
    });
    const data = await this.getJson(url);
    const products = data && Array.isArray(data.products) ? data.products : [];
    return this.normalizeMany(products.map((p) => this._mapProduct(p)));
  }

  async getItem(id, _options) {
    const code = String(id || '').replace(/^openbeautyfacts:/, '').trim();
    if (!code) return null;
    const url = `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
    const data = await this.getJson(url);
    const p = data && data.product;
    if (!p) return null;
    return this.normalize(this._mapProduct(p));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl(SEARCH_API, {
        search_terms: 'test', search_simple: 1, action: 'process', json: 1, page_size: 1,
      }));
      const n = data && data.count != null ? data.count : '?';
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: `search.pl probe succeeded (${n} total matches for probe query)` };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new OpenBeautyFactsSource(deps, meta);
}

module.exports = { meta, createSource };
