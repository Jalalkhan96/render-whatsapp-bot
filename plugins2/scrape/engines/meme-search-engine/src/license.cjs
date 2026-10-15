'use strict';

/**
 * license.cjs — the license engine.
 *
 * HARD RULE: unknown license NEVER becomes free.
 *
 * - free:    verified from source metadata (CC variants, CC0, public domain).
 *            Carries name + license URL + attribution string.
 * - unknown: user-generated meme content. Downloadable for personal use,
 *            but never labeled free — the sidecar says so explicitly.
 * - blocked: filtered out before it reaches results.
 */

const FREE_LICENSE_PATTERNS = [
  /public domain/i,
  /cc0/i,
  /cc-pd/i,
  /cc[-\s]?by(-sa|-nc|-nd)?(\s|$|[0-9.])/i,
  /creative commons/i,
];

function fromWikimedia(extmeta) {
  const em = extmeta || {};
  const name = em.LicenseShortName && em.LicenseShortName.value;
  const url = em.LicenseUrl && em.LicenseUrl.value;
  const artist = em.Artist && em.Artist.value
    ? String(em.Artist.value).replace(/<[^>]*>/g, '').trim()
    : null;
  if (name && FREE_LICENSE_PATTERNS.some((re) => re.test(name))) {
    return {
      status: 'free',
      name: String(name).replace(/<[^>]*>/g, '').trim(),
      url: url ? String(url).replace(/<[^>]*>/g, '').trim() : null,
      attribution: artist ? `${artist} / Wikimedia Commons (${name})` : `Wikimedia Commons (${name})`,
    };
  }
  // A Commons file whose license we cannot positively identify -> unknown.
  return {
    status: 'unknown',
    name: name || null,
    url: url || null,
    attribution: artist ? `${artist} / Wikimedia Commons` : null,
  };
}

function unknown(reason) {
  return { status: 'unknown', name: null, url: null, attribution: null, note: reason };
}

module.exports = { fromWikimedia, unknown, FREE_LICENSE_PATTERNS };
