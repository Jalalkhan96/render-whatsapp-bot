/*
 * core/license-engine.cjs — rights evaluation (§38, §96).
 *
 * Every reusable asset gets:
 *   license, licenseUrl, rights, attribution, commercialUse,
 *   modificationAllowed, redistributionAllowed.
 *
 * HARD RULES (§38):
 *  - NEVER convert 'unknown' into 'free'.
 *  - NEVER assume publicly visible == public domain.
 *  - Unknown means unknown: all use flags are false/unknown.
 */
'use strict';

const { classifyLicense } = require('./base-source.cjs');

const FREE_LICENSES = new Set(['public-domain', 'CC0-1.0', 'MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ODbL-1.0', 'PDDL-1.0']);
const CC_BY = new Set(['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'CC-BY-SA-3.0', 'CC-BY-3.0']);
const NON_COMMERCIAL = new Set(['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0']);
const NO_DERIVS = new Set(['CC-BY-ND-4.0']);
const RESTRICTED = new Set(['all-rights-reserved', 'copyrighted']);

function evaluate(result) {
  const license = classifyLicense(result && result.license);
  const lic = String(license).toLowerCase();
  const unknown = lic === 'unknown' || lic === 'not_available' || lic === '';

  const out = {
    license: unknown ? 'unknown' : license,
    licenseUrl: (result && result.licenseUrl) || null,
    rights: (result && result.rights) || 'unknown',
    attribution: null,
    commercialUse: 'unknown',
    modificationAllowed: 'unknown',
    redistributionAllowed: 'unknown',
  };

  if (unknown) {
    // §38: unknown stays unknown. Do NOT default to permissive.
    return out;
  }
  if (RESTRICTED.has(license)) {
    out.commercialUse = false;
    out.modificationAllowed = false;
    out.redistributionAllowed = false;
    return out;
  }
  if (FREE_LICENSES.has(license)) {
    out.commercialUse = true;
    out.modificationAllowed = true;
    out.redistributionAllowed = true;
    if (license === 'public-domain' || license === 'CC0-1.0') {
      out.attribution = 'not required (courtesy attribution recommended)';
    } else {
      out.attribution = 'required by license terms';
    }
    return out;
  }
  if (CC_BY.has(license)) {
    out.attribution = 'required (credit creator, link license)';
    out.commercialUse = NON_COMMERCIAL.has(license) ? false : true;
    out.modificationAllowed = NO_DERIVS.has(license) ? false : true;
    out.redistributionAllowed = true;
    return out;
  }
  if (lic === 'open-access') {
    out.commercialUse = 'unknown';
    out.modificationAllowed = 'unknown';
    out.redistributionAllowed = true;
    return out;
  }
  // Anything else recognised-but-unclassified: conservative.
  out.commercialUse = 'unknown';
  out.modificationAllowed = 'unknown';
  out.redistributionAllowed = 'unknown';
  return out;
}

function attachLicense(result) {
  const r = Object.assign({}, result);
  r.licenseInfo = evaluate(result);
  r.license = r.licenseInfo.license;
  return r;
}

module.exports = { evaluate, attachLicense, classifyLicense };
