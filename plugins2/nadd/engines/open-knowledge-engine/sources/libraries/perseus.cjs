/*
 * sources/libraries/perseus.cjs — Perseus Digital Library (LIMITED).
 *
 * Verified 2026-10-05: the legacy CTS endpoint
 *   http://www.perseus.tufts.edu/hopper/CTS?request=GetCapabilities
 * timed out with 0 bytes received; the Scaife Viewer API
 * (https://scaife.perseus.org/api/v1/...) and /library/ return HTML only —
 * there is no stable machine-readable search API for the text inventory.
 * Declared 'limited': search() returns [] and healthCheck explains why.
 * Texts remain browsable manually at https://scaife.perseus.org/library/.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'perseus',
  name: 'Perseus Digital Library',
  category: 'language',
  transport: 'api',
  baseUrl: 'https://scaife.perseus.org',
  docsUrl: 'https://scaife.perseus.org',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false,
    metadata: false,
    fullText: false,
    images: false,
    documents: false,
    api: false,
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 40,
  description: 'Perseus Digital Library (Greek/Latin classical texts): no stable machine-readable search API — legacy CTS endpoint unreachable, Scaife API returns HTML only. Browse texts manually.',
};

const DETAIL = 'Limited: Perseus legacy CTS endpoint (perseus.tufts.edu/hopper/CTS) is unreachable and the Scaife Viewer API returns HTML only — no machine-readable search API exists. Browse the text inventory manually at https://scaife.perseus.org/library/.';

class PerseusSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(_query, _options) {
    // No stable endpoint — never fabricate results.
    return [];
  }

  async getItem(_id, _options) {
    return null;
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      // Short probe of the legacy CTS endpoint to keep the reason current.
      await this.getText('http://www.perseus.tufts.edu/hopper/CTS?request=GetCapabilities', { timeoutMs: 8000, maxRetries: 0 });
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: 'CTS endpoint reachable but exposes no machine-readable search; ' + DETAIL };
    } catch (err) {
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: DETAIL };
    }
  }
}

module.exports = { meta, createSource: (deps) => new PerseusSource(deps, meta) };
