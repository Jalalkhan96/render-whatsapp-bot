'use strict';
/* BaseScraper contract documentation + runtime validation helper.
 * Adapters are plain objects; this module validates the required shape. */
const REQUIRED = ['id', 'name', 'country', 'category', 'baseUrl', 'enabled', 'priority', 'transport'];

function validateAdapter(adapter, id) {
  const problems = [];
  for (const k of REQUIRED) {
    if (adapter[k] === undefined || adapter[k] === null || adapter[k] === '') {
      problems.push(`missing field: ${k}`);
    }
  }
  for (const m of ['latest', 'search', 'scrape', 'normalize']) {
    if (typeof adapter[m] !== 'function') problems.push(`missing method: ${m}()`);
  }
  if (adapter.transport === 'provider-required' && !adapter.providerRequiredReason) {
    problems.push('transport=provider-required but no providerRequiredReason');
  }
  if (problems.length) {
    const err = new Error(`adapter ${id} invalid: ${problems.join('; ')}`);
    err.problems = problems;
    throw err;
  }
  return true;
}

module.exports = { validateAdapter, REQUIRED };
