'use strict';
// Per-site test for balochistan-gov (Balochistan Government). Run: node tests/sites/balochistan-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('balochistan-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
