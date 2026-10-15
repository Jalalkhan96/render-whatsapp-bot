'use strict';
// Per-site test for kfc (KFC Pakistan). Run: node tests/sites/kfc.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('kfc').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
