'use strict';
/**
 * License engine. #1 RULE: never map unknown->free, free-download->commercially
 * unrestricted, or royalty-free->public-domain. Unknown stays unknown
 * (licenseUnknown:true) all the way through.
 */

const LICENSE_VOCAB = [
  'CC0', 'Public Domain', 'Public Domain Mark',
  'CC BY', 'CC BY-SA', 'CC BY-NC', 'CC BY-ND', 'CC BY-NC-SA', 'CC BY-NC-ND',
  'MIT', 'ISC', 'Apache-2.0', 'Unlicense',
  'Unsplash License', 'Pexels License', 'Pixabay Content License',
  'Freepik Free License', 'unDraw License', 'Icons8 Free License',
  'iconmonstr License', 'Site-specific free license', 'NASA Usage Guidelines',
  'Free tier', 'Unknown', 'Restricted',
];

const CC_URL = {
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public Domain Mark': 'https://creativecommons.org/publicdomain/mark/1.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

function lic(license, licenseType, attributionRequired, commercialUse, modificationAllowed, licenseUrl) {
  return { license, licenseType, attributionRequired, commercialUse, modificationAllowed, licenseUrl: licenseUrl || '' };
}
function unknown() {
  return lic('Unknown', 'unknown', null, null, null, '');
}

/**
 * Parse a free-text license string into structured metadata.
 * Anything unrecognized -> Unknown (licenseUnknown:true downstream).
 */
function parseLicenseString(str) {
  const s = String(str || '').trim();
  if (!s) return unknown();
  const l = s.toLowerCase();
  const has = (...pats) => pats.some((p) => l.includes(p));

  // Order matters: check most-specific CC variants first.
  if (has('cc0', 'creative commons zero', 'cc zero')) return lic('CC0', 'CC0', false, true, true, CC_URL.CC0);
  if (has('public domain mark', 'pdm 1.0')) return lic('Public Domain Mark', 'public-domain', false, true, true, CC_URL['Public Domain Mark']);
  if (has('cc-by-nc-sa', 'cc by-nc-sa')) return lic('CC BY-NC-SA', 'cc', true, false, true, CC_URL['CC BY-NC-SA']);
  if (has('cc-by-nc-nd', 'cc by-nc-nd')) return lic('CC BY-NC-ND', 'cc', true, false, false, CC_URL['CC BY-NC-ND']);
  if (has('cc-by-nc', 'cc by-nc')) return lic('CC BY-NC', 'cc', true, false, true, CC_URL['CC BY-NC']);
  if (has('cc-by-nd', 'cc by-nd')) return lic('CC BY-ND', 'cc', true, true, false, CC_URL['CC BY-ND']);
  if (has('cc-by-sa', 'cc by-sa')) return lic('CC BY-SA', 'cc', true, true, true, CC_URL['CC BY-SA']);
  if (has('cc-by', 'cc by')) return lic('CC BY', 'cc', true, true, true, CC_URL['CC BY']);
  if (has('creative commons attribution')) return lic('CC BY', 'cc', true, true, true, CC_URL['CC BY']);

  if (/\bmit\b/.test(l) && has('license')) return lic('MIT', 'permissive', false, true, true, 'https://opensource.org/licenses/MIT');
  if (has('isc license')) return lic('ISC', 'permissive', false, true, true, 'https://opensource.org/licenses/ISC');
  if (has('apache')) return lic('Apache-2.0', 'permissive', false, true, true, 'https://www.apache.org/licenses/LICENSE-2.0');
  if (has('unlicense')) return lic('Unlicense', 'public-domain', false, true, true, 'https://unlicense.org/');

  if (has('unsplash')) return lic('Unsplash License', 'site-specific', false, true, true, 'https://unsplash.com/license');
  if (has('pexels')) return lic('Pexels License', 'site-specific', false, true, true, 'https://www.pexels.com/license/');
  if (has('pixabay')) return lic('Pixabay Content License', 'site-specific', false, true, true, 'https://pixabay.com/service/license-summary/');
  if (has('freepik')) return lic('Freepik Free License', 'site-specific', true, null, null, 'https://www.freepik.com/legal/terms-of-use');
  if (has('undraw')) return lic('unDraw License', 'site-specific', false, true, true, 'https://undraw.co/license');
  if (has('icons8')) return lic('Icons8 Free License', 'site-specific', true, null, null, 'https://icons8.com/license');
  if (has('iconmonstr')) return lic('iconmonstr License', 'site-specific', false, true, true, 'https://iconmonstr.com/license/');
  if (has('nasa')) return lic('NASA Usage Guidelines', 'site-specific', null, null, null, 'https://www.nasa.gov/nasa-brand-center/images-and-media/');

  // Plain "public domain" WITHOUT a specific mark: keep generic but honest.
  if (has('public domain') && !has('not')) return lic('Public Domain', 'public-domain', false, true, true, '');

  if (has('royalty-free', 'royalty free')) {
    // Royalty-free is NOT public domain and NOT a commercial guarantee.
    return lic('Site-specific free license', 'site-specific', null, null, null, '');
  }
  if (has('restricted', 'all rights reserved', '©', '(c)')) {
    return lic('Restricted', 'restricted', null, false, false, '');
  }
  return unknown();
}

function licenseTypeOf(license) {
  const l = String(license || '');
  if (l === 'CC0') return 'CC0';
  if (l === 'Public Domain' || l === 'Public Domain Mark') return 'public-domain';
  if (l.startsWith('CC BY')) return 'cc';
  if (['MIT', 'ISC', 'Apache-2.0', 'Unlicense'].includes(l)) return 'permissive';
  if (l === 'Unknown') return 'unknown';
  if (l === 'Restricted') return 'restricted';
  if (l === 'Free tier') return 'free-tier';
  return 'site-specific';
}

function attributionText(img) {
  const parts = [];
  if (img.title) parts.push(`"${img.title}"`);
  if (img.creator) parts.push(`by ${img.creator}`);
  if (img.source) parts.push(`via ${img.source}`);
  let t = parts.join(' ');
  if (img.license && img.license !== 'Unknown') {
    t += ` — ${img.license}`;
    if (img.licenseUrl) t += ` (${img.licenseUrl})`;
  } else {
    t += ' — license unknown, verify before use';
  }
  return t;
}

/**
 * Strict license filtering: a result passes only when its metadata actually
 * supports the filter. Unknown commercialUse fails --commercial; unknown
 * attribution fails --no-attribution.
 */
function passesLicenseFilter(img, f = {}) {
  const licenseName = String(img.license || 'Unknown');
  if (f.license) {
    const want = String(f.license).toLowerCase();
    if (want === 'cc0') {
      if (licenseName !== 'CC0') return false;
    } else if (want === 'public-domain' || want === 'publicdomain' || want === 'pd') {
      if (!['CC0', 'Public Domain', 'Public Domain Mark'].includes(licenseName)) return false;
    } else if (licenseName.toLowerCase() !== want && !licenseName.toLowerCase().includes(want)) {
      return false;
    }
  }
  if (f.commercial && img.commercialUse !== true) return false;
  if (f.noAttribution && img.attributionRequired !== false) return false;
  return true;
}

/**
 * Download decision gate: IMAGE -> ALLOW / WARN / REJECT.
 * deny ONLY for 'Restricted'. Unknown -> warn (user decides).
 */
function decideDownload(img) {
  if (String(img.license) === 'Restricted') {
    return { allow: 'deny', reason: 'License is Restricted (all rights reserved). Download blocked.' };
  }
  if (img.licenseUnknown || img.license === 'Unknown') {
    return { allow: 'warn', reason: 'License unknown — verify the source page before using this image.' };
  }
  if (img.licenseType === 'cc' && /NC/.test(String(img.license)) && img.commercialUse === false) {
    return { allow: 'warn', reason: `${img.license} forbids commercial use.` };
  }
  return { allow: 'allow', reason: '' };
}

module.exports = {
  LICENSE_VOCAB, parseLicenseString, licenseTypeOf, attributionText,
  passesLicenseFilter, decideDownload,
};
