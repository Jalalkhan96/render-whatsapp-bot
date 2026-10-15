'use strict';
// Per-site test for nayatel (Nayatel). Run: node tests/sites/nayatel.cjs
const { runSiteTest } = require('../siteTest.cjs');
runSiteTest('nayatel').then(r => { console.log(JSON.stringify(r)); process.exit(r.status === 'failed' ? 1 : 0); });
