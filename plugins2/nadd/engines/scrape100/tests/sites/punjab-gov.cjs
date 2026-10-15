'use strict';
// Per-site test for punjab-gov (Punjab Government). Run: node tests/sites/punjab-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('punjab-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
