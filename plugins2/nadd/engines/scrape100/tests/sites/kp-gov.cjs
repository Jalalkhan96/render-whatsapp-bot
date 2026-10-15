'use strict';
// Per-site test for kp-gov (KP Government). Run: node tests/sites/kp-gov.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('kp-gov').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
