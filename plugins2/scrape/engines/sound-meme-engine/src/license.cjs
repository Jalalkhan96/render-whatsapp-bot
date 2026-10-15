'use strict';

// License engine: unknown NEVER becomes free. Only Commons metadata can
// produce `free`; everything else is `unknown`.
const FREE_LICENSE_PATTERNS = [
  /public domain/i,
  /cc0/i,
  /cc[-\s]?by(-sa|-nc|-nd)?(\s|$|[0-9.])/i,
  /creative commons/i,
];

function fromWikimedia(extmeta) {
  const em = extmeta || {};
  const strip = (v) => (v && v.value ? String(v.value).replace(/<[^>]*>/g, '').trim() : null);
  const name = strip(em.LicenseShortName);
  const url = strip(em.LicenseUrl);
  const artist = strip(em.Artist);
  if (name && FREE_LICENSE_PATTERNS.some((re) => re.test(name))) {
    return {
      status: 'free', name, url,
      attribution: artist ? `${artist} / Wikimedia Commons (${name})` : `Wikimedia Commons (${name})`,
    };
  }
  return { status: 'unknown', name, url, attribution: artist ? `${artist} / Wikimedia Commons` : null };
}

function unknown(reason) {
  return { status: 'unknown', name: null, url: null, attribution: null, note: reason };
}

module.exports = { fromWikimedia, unknown };
